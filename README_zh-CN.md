# 天气应用（多数据源版）

本项目是基于 Next.js + EdgeOne Functions 的天气应用，支持多数据源自动降级。

## 数据源支持

- `openmeteo`（默认）
- `qweather`（和风天气）
- `owm`（OpenWeatherMap）

前端统一请求 `/weather` 网关，由网关按优先级调度与降级：

- 当指定数据源可用：返回指定源结果。
- 当指定数据源不可用：自动切换到其他可用源并返回。

## QWeather 使用说明（已按官方文档适配）

参考文档：<https://dev.qweather.com/docs/>

当前实现使用：

- 实时天气：`/v7/weather/now`
- 每日预报：`/v7/weather/15d`
- 逐小时预报：`/v7/weather/168h`
- 实时空气质量（新版本）：`/airquality/v1/current/{latitude}/{longitude}`

> 注意：`/v7/air/now` 为已弃用接口（官方文档标注预计 2026-06-01 停止），本项目已切换到 `airquality/v1`。

## 环境变量

项目根目录提供 `.env` 模板，请按需填写：

```bash
# 本地调试函数网关地址（可留空）
NEXT_PUBLIC_API_URL=

# QWeather
HFHOST=
HFKEY=
HFJWT=
HFID=

# OpenWeatherMap
OWMKey=
OWM_KEY=
```

### QWeather 关键配置说明

- `HFHOST`：必须填写你在 QWeather 控制台中的**专属 API Host**（例如 `abc123xyz.def.qweatherapi.com`）。
- 认证支持两种方式（二选一即可）：
	- `HFKEY`（API Key）
	- `HFJWT`（Bearer Token）

## 启动

```bash
npm install
npm run dev
```

打开 <http://localhost:3000>

## 常见问题

### 1) 加载天气失败 / QWeather 报错

请优先检查：

1. `HFHOST` 是否为你的专属 Host（不能是公共域名）。
2. `HFKEY` / `HFJWT` 是否已正确配置。
3. 账户是否触发 QWeather 限额或权限限制（常见 401/403/429）。

### 2) 指定数据源不可用

网关会自动降级到其他数据源，并在页面顶部提示自动切换信息。
