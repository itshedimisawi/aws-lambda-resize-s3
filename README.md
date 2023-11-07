# Resize and create thumbnails using Lambda and S3

Serverless automatic image resizing and thumbnail creation using AWS Lambda and S3. Image and thumbnail sizes can be specified per image.

### 1. Create S3 buckets
Create a source S3 bucket as a source and make sure it's not publicly available, we'll use it as a queue for the lambda function to read images from.

Also, create a destination S3 bucket that will contain the resized images and thumbnails created by Lambda function.

Clients should be able to upload files to the source bucket and retrieve them later from destination bucket.

### 2. Create a lambda function
Zip the code in the repository and upload it to the lambda function from your aws cli or web console.
Make sure to allocate 512 MB of memory and at least 20 seconds of execution time if you are dealing with large image files.

### 3. Source bucket permission policy
Attach this permission policy to your source bucket. 

The first two statements allows access to a user to manage the bucket which we can later use to upload files (optional).

The final statement grants the lambda function's attached execution role access to the bucket.

```json
{
    "Version": "2012-10-17",
    "Id": "Policy1698254444444",
    "Statement": [
        {
            "Sid": "Stmt1698254453333",
            "Effect": "Allow",
            "Principal": {
                "AWS": "__USER_ARN__"
            },
            "Action": [
                "s3:DeleteObject",
                "s3:GetObject",
                "s3:PutObject"
            ],
            "Resource": "arn:aws:s3:::__BUCKET_NAME__"
        },
        {
            "Effect": "Allow",
            "Principal": {
                "AWS": "__USER_ARN__"
            },
            "Action": "s3:ListBucket",
            "Resource": "arn:aws:s3:::__BUCKET_NAME__"
        },
        {
            "Effect": "Allow",
            "Principal": {
                "AWS": "__YOUR_LAMBDA_EXECUTION_ROLE_ARN__"
            },
            "Action": "s3:DeleteObject",
            "Resource": "arn:aws:s3:::imprint-s3-original/*"
        }
    ]
}
```


### 4. Destination bucket permission policy
Attach this permission policy to your destination bucket. 

The first two statements (optional) allows a user to upload files directly without going through the lambda function to save resources.

The third statement allows public access to the S3 bucket (optional).

The final statement grants the lambda function's attached execution role access to the bucket.
```json
{
    "Version": "2012-10-17",
    "Id": "Policy1698254576444",
    "Statement": [
        {
            "Sid": "Stmt1698254444444",
            "Effect": "Allow",
            "Principal": {
                "AWS": "__USER_ARN__"
            },
            "Action": [
                "s3:DeleteObject",
                "s3:GetObject",
                "s3:PutObject"
            ],
            "Resource": "arn:aws:s3:::__BUCKET_NAME__/*"
        },
        {
            "Effect": "Allow",
            "Principal": {
                "AWS": "__USER_ARN__"
            },
            "Action": "s3:ListBucket",
            "Resource": "arn:aws:s3:::__BUCKET_NAME__"
        },
        {
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::__BUCKET_NAME__/*"
        },
        {
            "Effect": "Allow",
            "Principal": {
                "AWS": "__YOUR_LAMBDA_EXECUTION_ROLE_ARN__"
            },
            "Action": "s3:PutObject",
            "Resource": [
                "arn:aws:s3:::__BUCKET_NAME__/*",
                "arn:aws:s3:::__BUCKET_NAME__"
            ]
        }
    ]
}
```

### 5. Lambda execution role permission policy
Attach this policy to the lambda's attached execution role to give it read and write permission to S3 buckets.

Usually CloudWatch policies are attached by default, just append the last two statements to the policy json.

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": "logs:CreateLogGroup",
            "Resource": "arn:aws:logs:me-central-1:1122334455:*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "logs:CreateLogStream",
                "logs:PutLogEvents"
            ],
            "Resource": [
                "arn:aws:logs:me-central-1:1122334455:log-group:/aws/lambda/s3-resize:*"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "s3:GetObject"
            ],
            "Resource": "arn:aws:s3:::*/*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:DeleteObject"
            ],
            "Resource": "arn:aws:s3:::*/*"
        }
    ]
}
```

### 6. Attach a trigger to lambda
In the Lambda aws console attach s3:ObjectCreated:* trigger the lambda function and specify the source bucket ARN.

### 7. Uploading images
When uploading images to the source bucket. If the image need to be resized, add **resize-width** and **resize-height** user metadata to it.

For thumbnail creation, attach **thumbnail-width** and **thumbnail-height** user metadata to the image with the corresponding width and height of the thumbnail.

Files that are not supported or does not contain resizing or thumbnail metadata will be uploaded directly to the destination bucket.

If you need to avoid Lambda execution, upload files directly to the destination bucket.

**Kotlin code example:**
```kotlin
val putObjectRequest = PutObjectRequest.builder()
            .bucket(
                when (shouldResize) {
                    true -> bucketSource
                    false -> bucketDest // skip resizing and upload to final bucket
                }
            ).run {
                val metadataMap = HashMap<String, String>()
                thumbnailSize?.let {
                    metadataMap["thumbnail-width"] = it.first.toString()
                    metadataMap["thumbnail-height"] = it.second.toString()
                }
                resizeTo?.let {
                    metadataMap["resize-width"] = it.first.toString()
                    metadataMap["resize-height"] = it.second.toString()
                }
                metadata(metadataMap)
            }
            .key(s3Path)
            .build()

        val data = file.streamProvider().readBytes()
        s3Client.putObject(putObjectRequest, RequestBody.fromInputStream(data.inputStream(), data.size.toLong()))
```


