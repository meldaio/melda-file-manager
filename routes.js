const route = require("express").Router();
const AWS = require("aws-sdk");
const S3 = new AWS.S3({ s3ForcePathStyle: true });
const Bucket = process.env.AWS_S3_BUCKET_NAME;
const Delimiter = "/";
const { slugify } = require("./lib/utils.js");
const path = require("path")
const kue = require("kue")

const queue = kue.createQueue({
  disableSearch: false,
  redis: {
    port: process.env.REDIS_PORT,
    host: process.env.REDIS_HOST
  }
})


queue.setMaxListeners(Infinity)

;(async () => {
  /*let params = { Bucket, Delimiter,
    // Prefix: "/",
  }

  let results = await S3.listObjects(params).promise();
  //console.log(results)*/
})();

const copyObject = async (objectInfo, sourceFolder, destFolder) => {
  let params = {
    Bucket,
    CopySource: Bucket + '/' + objectInfo.Key,
    Key: objectInfo.Key.replace(sourceFolder, destFolder)
  },
  result = false

  try {
    result = await S3.copyObject(params).promise()
  } catch (error) {
    console.error('Object Copy Error: ', error);
  }
  return result;
} // end Of copy

const getObjectTree = async (Prefix) => {
  // Get Object List From Prefix
  let objectList = await S3.listObjects({ Bucket, Delimiter, Prefix }).promise(),
      files = [],
      listResult = objectList.Contents
        .concat(objectList.CommonPrefixes)
        .filter(item => item.Key !== Prefix) // Remove Prefix from the list

  if ( listResult.length === 0 )
    return [];

  for ( let indx in listResult ) {
    let obj = listResult[indx]
    
    // If it is Folder go in folder
    if ( obj.Prefix ) {
      files = files.concat(await getObjectTree(obj.Prefix))
    } else {
      files.push(obj)
    }
  }
  return files;
} // end Of getObjectTree

const fileMapper = (item) => {
  return item.Key ? {
    size: item.Size,
    path: item.Key.replace(/^[^\/]+\//, ""),
    name: path.basename(item.Key),
    date: item.LastModified,
    isDir: !!item.Key.match(/\/$/)
  } : {
    size: 0,
    path: item.Prefix.replace(/^[^\/]+\//, ""),
    name: path.basename(item.Prefix),
    date: null,
    isDir: true,
  };
}

const checkFolderExist = async (Key) => {
  let exists = true;
  try {
    let result = await S3.getObject({ Key, Bucket }).promise();
  } catch (error) {
    exists = false
  }

  if ( ! exists ) {
    return S3.putObject({ Key, Bucket }).promise();
  }
  return exists;
}

route.get("/list/:project", async (req, res, next) => {
  try {
    let { project } = req.params;
    let Prefix = path.join(project, req.query.path) + "/";
    let params = { Bucket, Delimiter, Prefix };

    let result = await S3.listObjects(params).promise();

    let files = result.Contents
      .concat(result.CommonPrefixes)
      .filter(item => item.Key !== Prefix)
      .map(fileMapper);

    res.json(files);
  } catch (error) {
    console.error(error)
  }
});

route.get("/upload-url/:project", async (req, res, next) => {
  let { project } = req.params;
  let Key = project + "/";
  let params = { Key, Bucket }
  try {
    await checkFolderExist(Key)
  } catch (error) {
    console.error('New Project Folder Creation Error', error);
    return next(error)
  }

  params.Key += req.query.name.replace(/^\//, "");
  params.Expires = 600;
  params.ContentType = req.query.type;

  // Check if there is a file with the same name.
  try {
    let result = await S3.getObject(params).promise();
    params.Key += "-" + Date.now();
  } catch (error) {}

  let url = S3.getSignedUrl("putObject", params);

  res.json({ url });
});

route.get("/download-url/:project", async (req, res, next) => {
  const { project } = req.params;
  const Key = path.join(project, req.query.path);

  const name = path.basename(req.query.path);
  const ResponseContentDisposition = `attachment; filename="${name}"`;

  const params = { Key, Bucket, ResponseContentDisposition };

  const url = S3.getSignedUrl("getObject", params);
  res.json({ url });
});

route.post("/mkdir/:project", async (req, res, next) => {
  const { project } = req.params;
  const Key = path.join(project, req.body.path);

  try {
    await S3.putObject({ Key, Bucket }).promise();
  } catch (error) {
    return next(error);
  }

  res.json({ dir: Key });
})

route.post("/copy/:project/:newProject", async (req, res, next) => {
  const { project, newProject } = req.params
  const Key = path.join(project, req.body.path)
  const newKey = newProject + '/'
  const oldKey = project + '/'
  // Check newProjectFodler is Exist
  try {
    await checkFolderExist(newKey)
  } catch (error) {
    return next(error)
  }

  let isFolder = false

  try {
    await S3.getObject({Key, Bucket}).promise();
  } catch (error) {
    isFolder = true
  }

  if ( isFolder ) {
    let files = [],
        Prefix = Key + '/'

    try {
      files = await getObjectTree(Prefix)
      for ( let indx in files ) {
        let file = files[indx];
        await copyObject(file, oldKey, newKey);
      }
    } catch (error) {
      console.error('Copy object gives error', error);
      return next(error);
    }
  } else {
    let file = {Key}
    try {
      await copyObject(file, oldKey, newKey)
    } catch (error) {
      console.error('Copy object gives error', error);
      return next(error);
    }
  }

  res.json({ dir: Key });
})

route.post("/move/:project/:newProject", async (req, res, next) => {
  const { project, newProject } = req.params
  const Key = path.join(project, req.body.path)
  const newKey = newProject + '/'
  const oldKey = project + '/'
  // Check newProjectFodler is Exist
  try {
    await checkFolderExist(newKey)
  } catch (error) {
    return next(error)
  }
  
  try {
    await copyObject({Key}, oldKey, newKey)
    await S3.deleteObject({ Bucket, Delete: { Key } }).promise()
  } catch (error) {
    return next(error);
  }

  res.json({ dir: Key });
})

queue.process("start fork file", 100, async(job, done) => {
  const { project, newProject } = job.data;
  const oldKey = project + '/';
  const newKey = newProject + '/';
  // Check newProjectFolder is Exist
  

  try {
    await checkFolderExist(newKey);
  } catch (error) {
    return done(error)
  }
  console.log('New project folder created', {project, newProject});
  let files = [],
      Prefix = project + '/'

  try {
    files = await getObjectTree(Prefix)
    console.log('Project Files: ', {files});
    for ( let indx in files ) {
      let file = files[indx];
      await copyObject(file, oldKey, newKey);
      console.log('Copied: ', {file, oldKey, newKey})
    }
  } catch (error) {
    console.error('Copy object give error', error);
  }
  done(null)
});

route.post("/:project", async (req, res, next) => {
  const { project } = req.params;
  const Key = project + '/';

  try {
    await S3.putObject({ Key, Bucket }).promise();
  } catch (error) {
    return next(error);
  }

  res.json({ dir: Key });
})

route.delete("/:project", async (req, res, next) => {
  const { project } = req.params;
  const Objects = req.query.files.map(name => {
    return { Key: path.join(project, req.query.path, name) };
  });

  try {
    await S3.deleteObjects({ Bucket, Delete: { Objects } }).promise();
  } catch (error) {
    return next(error);
  }

  res.json({ success: true });
});




module.exports = route