const express = require("express"),
  app = express(),
  bodyParser = require("body-parser"),
  fs = require("fs"),
  PORT = 8888;
app.listen(PORT, () => {
  console.log(`服务端已启动，端口号：${PORT}`);
});
app.use(
  bodyParser.urlencoded({
    extended: false,
    limit: "2048mb",
  })
);
let join = require("path").join;

/*-API-*/
const multiparty = require("multiparty"),
  uploadDir = `${__dirname}/upload`;

function handleMultiparty(req, res, temp) {
  return new Promise((resolve, reject) => {
    // multiparty的配置
    let options = {
      maxFieldsSize: 200 * 1024 * 1024,
    };
    !temp ? (options.uploadDir = uploadDir) : null;
    let form = new multiparty.Form(options);
    // multiparty解析
    form.parse(req, function (err, fields, files) {
      if (err) {
        res.send({
          code: 1,
          reason: err,
        });
        reject(err);
        return;
      }
      resolve({
        fields,
        files,
      });
    });
  });
}

//查找已经上传的文件
function findSync(startPath) {
  let result = [];

  function finder(path) {
    let files = fs.readdirSync(path);

    files.forEach((val, index) => {
      let fPath = join(path, val);

      let stats = fs.statSync(fPath);

      if (stats.isFile()) result.push(val.split(".")[0]);
    });
  }

  finder(startPath);

  return result;
}

//查找上传过程中的文件
function findLoadingSync(startPath, hash) {
  let result = [];

  function finder(path, isChild) {
    let files = fs.readdirSync(path);

    files.forEach((val) => {
      let fPath = join(path, val);

      let stats = fs.statSync(fPath);

      if (stats.isDirectory() && hash == val) finder(fPath, val);

      if (stats.isFile() && isChild == hash) result.push(val);
    });
  }

  finder(startPath);

  return result;
}

//判断当前文件是否曾经上传，如果上传且没有上传完成返回已经上传的文件切片名称
app.get("/loadingUpload", (req, res) => {
  let { hash } = req.query;
  let hasUpList = findLoadingSync(uploadDir, hash);
  res.send({
    code: 0,
    data: hasUpList,
  });
});

app.post("/upload", async (req, res) => {
  let { fields, files } = await handleMultiparty(req, res, true);

  let [chunk] = files.chunk,
    [filename] = fields.filename;
  let hash = /([0-9a-zA-Z]+)_\d+/.exec(filename)[1],
    path = `${uploadDir}/${hash}`;
  let hasUpList = findSync(uploadDir);
  if (hasUpList.indexOf(hash) > -1) {
    res.send({
      code: 2,
      msg: "当前文件已经上传！",
    });
    return;
  }
  !fs.existsSync(path) ? fs.mkdirSync(path) : null;
  path = `${path}/${filename}`;
  fs.access(path, async (err) => {
    // 存在的则不再进行任何的处理
    if (!err) {
      res.send({
        code: 0,
        path: path.replace(__dirname, `http://127.0.0.1:${PORT}`),
      });
      return;
    }

    // 为了测试出效果，延迟1秒钟
    await new Promise((resolve) => {
      setTimeout((_) => {
        resolve();
      }, 200);
    });

    // 不存在的再创建
    let readStream = fs.createReadStream(chunk.path),
      writeStream = fs.createWriteStream(path);
    readStream.pipe(writeStream);
    readStream.on("end", function () {
      fs.unlinkSync(chunk.path);
      res.send({
        code: 0,
        path: path.replace(__dirname, `http://127.0.0.1:${PORT}`),
      });
    });
  });
});

app.get("/merge", (req, res) => {
  let { hash } = req.query;

  let path = `${uploadDir}/${hash}`,
    fileList = fs.readdirSync(path),
    suffix;
  fileList
    .sort((a, b) => {
      let reg = /_(\d+)/;
      return reg.exec(a)[1] - reg.exec(b)[1];
    })
    .forEach((item) => {
      !suffix ? (suffix = /\.([0-9a-zA-Z]+)$/.exec(item)[1]) : null;
      fs.appendFileSync(
        `${uploadDir}/${hash}.${suffix}`,
        fs.readFileSync(`${path}/${item}`)
      );
      fs.unlinkSync(`${path}/${item}`);
    });
  fs.rmdirSync(path);
  res.send({
    code: 0,
    path: `http://127.0.0.1:${PORT}/upload/${hash}.${suffix}`,
  });
});

app.use(express.static("./"));
app.use((req, res) => {
  res.status(404);
  res.send("NOT FOUND!");
});
