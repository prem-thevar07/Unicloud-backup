import { S3Client, ListObjectsV2Command, DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

const getS3Client = (account) => {
  const getCred = (key) => account.credentials?.get ? account.credentials.get(key) : account.credentials?.[key];
  const accessKeyId = getCred("accessKeyId") || account.accessToken;
  const secretAccessKey = getCred("secretAccessKey") || account.refreshToken;
  const region = getCred("region") || "us-east-1";

  return new S3Client({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
};

const getBucketName = (account) => {
  const getCred = (key) => account.credentials?.get ? account.credentials.get(key) : account.credentials?.[key];
  return getCred("bucketName") || "unicloud-bucket";
};

export const fetchS3Files = async (account, pageToken, options = {}) => {
  try {
    const client = getS3Client(account);
    const bucket = getBucketName(account);
    
    const { folderPath, search, pageSize = 100 } = options;
    
    // Construct command
    const params = {
      Bucket: bucket,
      MaxKeys: pageSize,
      ContinuationToken: pageToken || undefined,
    };

    if (search) {
      // If searching, search recursively (no delimiter)
      params.MaxKeys = 1000; // retrieve a larger batch to filter
    } else if (folderPath) {
      // Normal navigation inside a folder: list only children of this folder
      params.Delimiter = "/";
      let prefix = folderPath;
      if (prefix.startsWith("/")) {
        prefix = prefix.slice(1);
      }
      if (prefix && !prefix.endsWith("/")) {
        prefix = prefix + "/";
      }
      params.Prefix = prefix || undefined;
    } else {
      // Root level/general fetch: list recursively (no delimiter)
      params.Prefix = undefined;
    }

    const command = new ListObjectsV2Command(params);
    const res = await client.send(command);

    let rawFiles = res.Contents || [];
    
    // Exclude folder placeholders (e.g. key ends with '/')
    rawFiles = rawFiles.filter(item => item.Key && !item.Key.endsWith("/"));

    // If search is active, filter client side
    if (search) {
      const q = search.toLowerCase();
      rawFiles = rawFiles.filter(item => {
        const name = item.Key.split("/").pop() || "";
        return name.toLowerCase().includes(q);
      });
      // Slice to pageSize
      rawFiles = rawFiles.slice(0, pageSize);
    }

    return {
      files: rawFiles,
      nextPageToken: res.NextContinuationToken || null,
    };
  } catch (err) {
    console.error("❌ S3 fetchS3Files failed:", err.message);
    throw err;
  }
};

export const fetchS3Folders = async (account) => {
  try {
    const client = getS3Client(account);
    const bucket = getBucketName(account);

    // List all folders recursively by getting prefixes
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      MaxKeys: 1000,
    });
    const res = await client.send(command);

    const folderPaths = new Set();
    
    // 1. Identify virtual folders from common directories
    if (res.Contents) {
      res.Contents.forEach(item => {
        if (item.Key && item.Key.includes("/")) {
          const parts = item.Key.split("/");
          // E.g. "documents/receipts/invoice.pdf" -> add "documents/", "documents/receipts/"
          let current = "";
          for (let i = 0; i < parts.length - 1; i++) {
            current += parts[i] + "/";
            folderPaths.add(current);
          }
        }
      });
    }

    // Convert Set to unicloud standard folder structures
    const folders = Array.from(folderPaths).map(path => {
      // Remove trailing slash for name
      const name = path.endsWith("/") ? path.slice(0, -1).split("/").pop() : path;
      const cleanPath = "/" + (path.endsWith("/") ? path.slice(0, -1) : path);
      return {
        id: cleanPath, // the clean UNIX path acts as folder ID!
        name,
        provider: "s3",
        accountId: account._id.toString(),
        accountEmail: account.email,
        path: cleanPath,
      };
    });

    return folders;
  } catch (err) {
    console.error("❌ S3 fetchS3Folders failed:", err.message);
    return [];
  }
};

export const deleteS3File = async (account, fileId) => {
  try {
    const client = getS3Client(account);
    const bucket = getBucketName(account);

    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: fileId, // fileId is the Key!
    });
    await client.send(command);
    return true;
  } catch (err) {
    console.error("❌ S3 deleteS3File failed:", err.message);
    throw err;
  }
};

// Upload S3 file
export const uploadS3File = async (account, file, folderPath) => {
  const client = getS3Client(account);
  const bucket = getBucketName(account);
  const fs = await import("fs");

  let key = file.originalname;
  if (folderPath && folderPath !== "root") {
    let cleanFolder = folderPath;
    if (cleanFolder.startsWith("/")) {
      cleanFolder = cleanFolder.slice(1);
    }
    if (cleanFolder && !cleanFolder.endsWith("/")) {
      cleanFolder += "/";
    }
    key = cleanFolder + key;
  }

  const fileStream = fs.createReadStream(file.path);
  fileStream.on("error", (err) => {
    console.error("S3 upload stream error:", err);
  });

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: fileStream,
    ContentType: file.mimetype,
  });

  const response = await client.send(command);
  return {
    id: key,
    name: file.originalname,
    path: "/" + key,
    response,
  };
};
