const aws = require("aws-sdk");
const sharp = require("sharp");
const s3 = new aws.S3();

exports.handler = async function (event, context) {
  // Skip delete trigger
  console.log("Received S3 event:", JSON.stringify(event, null, 2));
  if (event.Records[0].eventName === "ObjectRemoved:Delete") {
    return;
  }

  const srcBucket = event.Records[0].s3.bucket.name;
  const destBucket = "dest-bucket";
  const key = event.Records[0].s3.object.key; // src and dest same

  const copyObjectDirectly = async () => { // copies the file directly without resizing
    await s3
      .copyObject({
        CopySource: `${srcBucket}/${key}`,
        Bucket: destBucket,
        Key: key,
      })
      .promise();
  };

  const copyThumbnailDirectly = async () => { // copies the file directly without resizing
    await s3
      .copyObject({
        CopySource: `${srcBucket}/${key}`,
        Bucket: destBucket,
        Key: `thumbnails/${key}`,
      })
      .promise();
  };


  console.log(`Source Bucket: ${srcBucket}`, `Key: ${key}`);

  const typeMatch = event.Records[0].s3.object.key.match(/\.([^.]*)$/); //EXTENSION

  let image = await s3.getObject({ Bucket: srcBucket, Key: key }).promise();

  if (
    !typeMatch ||
    typeMatch.length < 2 ||
    (typeMatch[1].toLowerCase() != "jpeg" &&
      typeMatch[1].toLowerCase() != "jpg" &&
      typeMatch[1].toLowerCase() != "png")
  ) {
    // NOT AN IMAGE
    console.log(`Unsupported image type.. copying file as is to dest bucket`);

    await copyObjectDirectly();
  } else {
    // GET S3 HEAD OBJ CONTAINING USER METADATA (final image size and its thumbnail size)
    const S3UserMetadata = await s3
      .headObject({ Bucket: srcBucket, Key: key })
      .promise();

    if (
      !S3UserMetadata.Metadata.hasOwnProperty("resize-width") ||
      !S3UserMetadata.Metadata.hasOwnProperty("resize-height")
    ) {
      // RESIZE NOT NEEDED
      console.log(
        "resize-width and resize-height not found in metadata.. copying file as is to dest bucket"
      );
      await copyObjectDirectly();
    } else {
      // RESIZE NEEDED
      try {
        // load image
        image = sharp(image.Body);

        // get image original size
        const metadata = await image.metadata(); 

        console.log(`orignal : ${metadata.width}x${metadata.width}`);

        const resizeMetadataWidth = Number(
          S3UserMetadata.Metadata["resize-width"]
        );
        const resizeMetadataHeight = Number(
          S3UserMetadata.Metadata["resize-height"]
        );

        console.log(
          `resize to : ${resizeMetadataWidth}x${resizeMetadataHeight}`
        );

        if (
          metadata.width > resizeMetadataWidth || // check if we need to resize
          metadata.height > resizeMetadataHeight
        ) {

          const ratio = metadata.width / metadata.height; // get aspect ratio

          const newSize =
            metadata.width > metadata.height
              ? { width: resizeMetadataWidth, height: Math.round(resizeMetadataWidth / ratio) }
              : { height: resizeMetadataHeight, width: Math.round(resizeMetadataHeight * ratio) };

          const resizedImage = await image
            .resize(newSize)
            .withMetadata()
            .toBuffer();

          // store image
          console.log("Resizing done.. uploading to dest bucket");
          await s3
            .putObject({ Bucket: destBucket, Key: key, Body: resizedImage })
            .promise();
        } else {
          console.log("Resize not needed.. copying"); // if no resize needed, copy the file directly
          await copyObjectDirectly();
        }
      } catch (err) {
        console.log("Error resizing.. copying image as is",err); // if error while resizing, copy the file directly
        await copyObjectDirectly();
      }
    }

    // Thumbnail creation
    if (
      S3UserMetadata.Metadata.hasOwnProperty("thumbnail-width") && // check for metadata, if not provided, skip thumbnail creation
      S3UserMetadata.Metadata.hasOwnProperty("thumbnail-height")
    ) {
      try {
        console.log("Creating thumbnail");

        // check if we already loaded the image when resizing it in the first step to optimize memory usage
        console.log("already loaded: ", !image.hasOwnProperty("Body"));

        image = image.hasOwnProperty("Body") ? sharp(image.Body) : image; // check if its already loaded using sharp, if not then it's a GetObjectOutput from S3

        const metadata = await image.metadata(); // get original size

        const thumbnailMetadataWidth = Number(
          S3UserMetadata.Metadata["thumbnail-width"]
        );
        const thumbnailMetadataHeight = Number(
          S3UserMetadata.Metadata["thumbnail-height"]
        );

        console.log(
          `thumbnail to : ${thumbnailMetadataWidth}x${thumbnailMetadataHeight}`
        );

        if (
          metadata.width > thumbnailMetadataWidth || // check if it's bigger than the requested thumbnail
          metadata.height > thumbnailMetadataHeight
        ) {

          const ratio = metadata.width / metadata.height;

          const newSize =
            metadata.width > metadata.height
              ? { width: thumbnailMetadataWidth, height: Math.round(thumbnailMetadataWidth / ratio) }
              : { height: thumbnailMetadataHeight, width: Math.round(thumbnailMetadataHeight * ratio)};

          const thumbnailImage = await image
            .resize(newSize)
            .withMetadata()
            .toBuffer();

          // store image
          console.log("Thumbnail created.. uploading");
          await s3
            .putObject({
              Bucket: destBucket,
              Key: `thumbnails/${key}`,
              Body: thumbnailImage,
            })
            .promise();
        } else {
          console.log(
            "Thumbnail resize not needed.. copying to dest bucket" // if not big enough to create a thumbnail, copy the file directly to dest bucket
          );
          await copyThumbnailDirectly();
        }
      } catch (err) {
        console.log("Error creating thumbnail.. copying",err); // if error while creating thumbnail, copy the file directly
        await copyThumbnailDirectly();
      }
    }
  }
  // DELETE SOURCE OBJECT
  await s3.deleteObject({ Bucket: srcBucket, Key: key }).promise(); // delete source object from source bucket
  console.log("Deleted source object: " + srcBucket + "/" + key);
  return ("DONE");
};
