## 欢迎使用 kments

这是一个开源的追求高性能的评论系统。

## 环境变量列表

|         名称         | 含义                       |         示例          | 是否必填 |
|:------------------:|:-------------------------|:-------------------:|:----:|
|     `DOM_URL`      | 前端 URL（附带协议）             | `https://kmar.top/` |  是   |
|  `ADMIN_PASSWORD`  | 管理员密码                    |     `123456789`     |  是   |
|   `MONGODB_NAME`   | MongoDB 名称               |       `kmar`        |  是   |
| `MONGODB_PASSWORD` | MongoDB 密码               |     `WuLaWuLa`      |  是   |
|      `KV_URL`      | Vercel KV 的 URL          |  Vercel KV 启用后自动设置  |  否   |
|    `REDIS_URL`     | Redis 服务的 URL            | `redis://xxx:35346` |  否   |
|    `REDIS_HOST`    | Redis 服务的 host           |   `redis-xxx.com`   |  否   |
|    `REDIS_PORT`    | Redis 服务的端口              |       `3306`        |  否   |
|  `REDIS_PASSWORD`  | Redis 服务的密码              |     `123456789`     |  否   |
| `RATE_LIMIT_TIME`  | 每个 IP 访问频率统计的时间周期（单位 ms） |       `10000`       |  否   |
| `RATE_LIMIT_COUNT` | 每个 IP 在一个时间周期内访问次数上限     |        `100`        |  否   |

对于 Redis 服务，`REDIS_HOST`、`REDIS_PORT` 和 `REDIS_PASSWORD` 为同一组内容，`KV_URL` 和 `REDIS_URL` 各自一组。服务选择优先级如下：`KV_URL` > `REDIS_URL` > `REDIS_HOST`。