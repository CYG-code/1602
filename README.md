# 1602美食录（微信小程序）

一个基于微信云开发（CloudBase）的校园美食地图与打卡小程序。

## 项目现状

当前已实现：

- 地图双模式展示
- 位置+关键词检索店铺（支持范围、数量、筛选）
- 新增店铺（地图选点、标签、多类型、店铺图片 1~3 张）
- 管理员编辑店铺
- 店铺详情、收藏、导航
- 打卡发布（推荐/不推荐必填，五星可选，文字可选，餐品名可选，餐品图可传）
- 评论、点赞、分享
- 管理员删除打卡/评论
- 个人页、我的打卡、我的收藏
- 首次登录读取微信昵称头像，并支持后续编辑资料

## 技术栈

- 微信小程序原生框架
- 微信云开发（云函数 + 云数据库 + 云存储）
- 腾讯位置服务 WebServiceAPI（云函数内签名调用）

## 目录结构

```text
.
├─miniprogram
│  ├─pages
│  │  ├─index            # 首页（地图/检索）
│  │  ├─shopDetail       # 店铺详情
│  │  ├─postCheckin      # 发布打卡
│  │  ├─addShop          # 新增/编辑店铺
│  │  ├─profile          # 我的
│  │  ├─editProfile      # 资料编辑
│  │  ├─myCheckins       # 我的打卡
│  │  └─myFavorites      # 我的收藏
│  └─components
├─cloudfunctions
│  ├─shop                # 店铺检索/新增/编辑/逆地理
│  ├─user                # 登录/会话/资料/收藏
│  ├─checkin             # 打卡发布/列表/删除
│  ├─comment             # 评论发布/列表/删除
│  ├─like                # 点赞切换
│  └─quickstartFunctions # 云开发模板函数（可选）
└─docs
```

## 云函数动作（action）

- `shop`: `search` `createCustom` `updateShop` `getEditorPermission` `reverseGeocode`
- `user`: `getSession` `login` `updateProfile` `toggleFavorite` `getFavoriteStatus` `getFavorites`
- `checkin`: `create` `delete` `getByShop` `getByUser`
- `comment`: `create` `delete` `getByCheckin`
- `like`: `toggle`

## 数据库集合

需要用到以下集合：

- `shops`
- `users`
- `checkins`
- `comments`
- `likes`

## 首次部署步骤（重要）

### 1. 云环境

- 在微信开发者工具中绑定云开发环境
- 确认 `miniprogram/envList.js` 中环境 ID 正确

### 2. 云函数配置

编辑以下配置文件：

- `cloudfunctions/shop/config.json`
- `cloudfunctions/checkin/config.json`
- `cloudfunctions/comment/config.json`

配置项说明：

- `shop/config.json`
  - `mapKey`: 腾讯位置服务 Key
  - `mapSk`: 腾讯位置服务 SK（仅放云端）
  - `radius`: 默认检索半径（米）
  - `pageSize`: 默认检索数量
  - `adminOpenids`: 管理员 openid 数组
- `checkin/comment/config.json`
  - `adminOpenids`: 管理员 openid 数组

### 3. 上传并部署云函数

至少部署这 5 个：

- `shop`
- `user`
- `checkin`
- `comment`
- `like`

`quickstartFunctions` 不是业务必需，可不部署。

### 4. 云存储权限

建议先设置为：

- `所有用户可读`

否则可能出现图片无法展示、`getTempFileURL` 返回 `STORAGE_EXCEED_AUTHORITY`。

### 5. 小程序权限声明

项目已在 `miniprogram/app.json` 声明：

- `scope.userLocation`

真机若反复弹定位提示，请确认：

- 已重新编译
- 已授权定位权限

## 腾讯地图 Key/SK 说明

- 如果你开启了 WebServiceAPI 签名校验，必须在云函数内计算 `sig`
- 小程序前端不要暴露 `mapSk`
- 若报“签名验证失败”，优先检查：
  - 参数排序
  - 原始参数参与签名
  - SK 是否正确
  - 云函数是否已重新部署

## 管理员能力说明

管理员可执行：

- 编辑店铺
- 删除任意打卡
- 删除任意评论

管理员判定来源于各云函数配置内的 `adminOpenids`。

## 日常开发注意事项

- 前端改动：重新编译小程序
- 云函数改动：必须重新上传并部署对应函数
- 若报 `不支持的 action: xxx`：几乎一定是该云函数未部署最新代码

## 常见问题排查

- 店铺检索报 `不支持的 action: search`
  - 重新部署 `shop`
- 编辑店铺保存无效
  - 检查 `shop` 是否最新部署
  - 检查当前 openid 是否在 `adminOpenids`
- 图片灰块/黑块不显示
  - 检查云存储读权限
  - 在控制台验证 `wx.cloud.getTempFileURL`
- 控制台提示索引建议并超时
  - 按提示为对应集合字段创建索引

## 安全建议

- 不要把真实 `mapKey/mapSk`、`adminOpenids` 提交到公开仓库
- 若 Key/SK 曾泄露，请立即在腾讯位置服务控制台重置

---

如需我继续，我可以下一步把 README 再补一版“测试清单（逐条点点点操作）”，你可以按清单一轮验收。  
