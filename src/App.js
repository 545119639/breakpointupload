import React from "react";
import { Button, Progress, message } from "antd";
import "./App.css";
import SparkMD5 from "spark-md5";
import axios from "axios";

const SIZE = 10 * 1024 * 1024; // 切片大小

class App extends React.Component {
  state = {
    fileSize: 0,
    loading: false,
    abort: false,
    total: 0,
    partList: [],
    hash: "",
    isErr: false,
    computedFileSize: false,
  };

  //创建切片
  createChunkFile = async (file) => {
    if (!file) return;

    // 解析为BUFFER数据
    let buffer = await this.fileParse(file);
    let spark = new SparkMD5.ArrayBuffer();
    let hash;
    let suffix;
    spark.append(buffer);
    hash = spark.end();
    suffix = /\.([0-9a-zA-Z]+)$/i.exec(file.name)[1];

    // 把一个文件分割成为好几个部分（固定数量/固定大小）,每一个切片有自己的部分数据和自己的名字
    let partList = [];
    let count = Math.ceil(file.size / SIZE);
    let partSize = file.size / count;
    let cur = 0;
    for (let i = 0; i < count; i++) {
      let item = {
        chunk: file.slice(cur, cur + partSize),
        filename: `${hash}_${i}.${suffix}`,
      };
      cur += partSize;
      partList.push(item);
    }
    this.setState(
      {
        partList: partList,
        hash: hash,
      },
      () => {
        this.getLoadingFiles(hash);
      }
    );
  };

  //根据切片数创造切片数个请求
  uploadFn = async (list) => {
    let p = parseInt(Math.ceil(100 / this.state.partList.length));
    //根据切片数创造切片数个请求
    let requestList = [];
    let _this = this;
    this.state.partList.forEach((item, index) => {
      let fn = () => {
        let formData = new FormData();
        formData.append("chunk", item.chunk);
        formData.append("filename", item.filename);
        return axios
          .post("/upload", formData, {
            headers: { "Content-Type": "multipart/form-data" },
          })
          .then((result) => {
            result = result.data;
            if (result.code === 0) {
              let c = _this.state.total + p;
              // 传完的切片我们把它移除掉
              let l = [..._this.state.partList];
              l.splice(index, 1);
              _this.setState({
                partList: l,
                total: c >= 100 ? 100 : c,
              });
            } else if (result.code === 2) {
              _this.setState({
                isErr: true,
              });
            }
          })
          .catch(function () {
            _this.setState({
              loading: true,
              abort: true,
            });
          });
      };
      requestList.push(fn);
    });
    this.setState(
      {
        computedFileSize: false,
      },
      () => {
        let i = list ? list.length - 1 : 0;
        this.uploadSend(i, requestList);
      }
    );
  };

  //最后一个切片上传完成，合并切片
  uploadComplete = async () => {
    let result = await axios.get("/merge", {
      params: {
        hash: this.state.hash,
      },
    });
    result = result.data;
    if (result.code === 0) {
      message.success("上传成功");
    }
  };

  //上传单个切片
  uploadSend = async (c, requestList) => {
    // 已经中断则不再上传
    if (this.state.abort) return;
    if (c >= requestList.length) {
      // 都传完了
      this.uploadComplete();
      return;
    }
    await requestList[c]();
    if (this.state.isErr) {
      message.error("当前文件已上传");
      return;
    }
    c++;
    this.uploadSend(c, requestList);
  };

  //检查当前文件是否曾经上传
  getLoadingFiles = async (hash) => {
    let result = await axios.get("/loadingUpload", {
      params: {
        hash: hash,
      },
    });
    let res = result.data;
    if (res.code === 0) {
      if (res.data.length === 0) {
        this.uploadFn();
      } else {
        let p = parseInt(Math.ceil(100 / this.state.partList.length));
        this.setState(
          {
            total: res.data.length * p,
          },
          () => {
            this.uploadFn(res.data);
          }
        );
      }
    }
  };

  //监听input标签函数
  fileChage = () => {
    this.setState({
      total: 0,
    });
  };

  //点击上传函数
  uploadFile = () => {
    this.setState({
      computedFileSize: true,
    });
    this.createChunkFile(this.inputFile.files[0]);
  };

  //点击暂停或者继续的函数
  onClick = () => {
    if (!this.inputFile.files[0]) return;
    if (this.state.loading) {
      //继续上传
      this.setState(
        {
          loading: false,
          abort: false,
        },
        () => {
          this.uploadFn();
        }
      );
    } else {
      //暂停上传
      this.setState({
        loading: true,
        abort: true,
      });
    }
  };

  //转换文件类型（解析为BUFFER数据）
  fileParse = (file) => {
    return new Promise((resolve) => {
      let fileRead = new FileReader();
      fileRead.readAsArrayBuffer(file);
      fileRead.onload = (ev) => {
        resolve(ev.target.result);
      };
    });
  };

  render() {
    const { total, loading, computedFileSize } = this.state;
    return (
      <div className="App">
        <input
          type="file"
          ref={(el) => (this.inputFile = el)}
          onChange={this.fileChage}
        />
        <Button
          type="primary"
          onClick={this.uploadFile}
          disabled={total > 0 ? true : false}
          loading={computedFileSize}
        >
          上传
        </Button>
        {loading ? (
          <Button onClick={this.onClick}>继续</Button>
        ) : (
          <Button onClick={this.onClick}>暂停</Button>
        )}

        <div className="proDiv">
          {computedFileSize ? (
            <div className="divSpan">计算文件大小</div>
          ) : (
            <div className="divSpan">上传进度：{`${total}%`}</div>
          )}
          <Progress
            percent={total}
            status={total < 100 ? "active" : "success"}
          />
        </div>
      </div>
    );
  }
}

export default App;
