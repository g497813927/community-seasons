# 渲染组件

[English](README.md) | [简体中文](README.zh-CN.md)

`../render.ts` 仍是公开的 `Renderer` 入口。它负责每个画布的状态、预览缓存和帧合成，并将具体绘制工作委托给下列模块。组件通过参数显式接收该渲染器；它们对 `Renderer` 的导入仅用于类型，不会形成运行时循环导入。

| 修改内容 | 模块 |
| --- | --- |
| 电视机身体，以及奔跑、滑行、回弹和乘坐姿态 | `characters/runner.ts` |
| 追赶的捣乱评论者 | `characters/commenters.ts` |
| 小车车身，以及乘客登车和跌落 | `characters/cart.ts` |
| 四季路边景物与远景全景 | `scenes/spring.ts`, `summer.ts`, `autumn.ts`, `winter.ts` |
| 共享的树木、水面、路灯、长椅、房屋、集市和船只 | `scenes/landmarks.ts` |
| 景物模板缓存及其在岔路分支上的放置 | `scenes/index.ts` |
| 季节颜色、天空和地面 | `styles.ts`, `environment.ts` |
| 跑道和岔路标志 | `road.ts` |
| 铁轨、答案门和出口位置 | `railway.ts` |
| 季节传送门和交通入口框架 | `gates.ts` |
| 金币和强化道具 | `collectibles.ts` |
| 评论卡障碍物和双语标签 | `obstacles.ts` |
| 转弯镜头和路线坐标 | `camera.ts` |
| 面、盒体、投影和裁剪 | `geometry.ts`, `types.ts` |
| 面排序、纹理、雾和文字绘制 | `paint.ts` |
| 加速覆盖效果、光照和穿越隧道 | `effects.ts` |
| 帽子、鞋子与随游戏时间变化的装饰粒子 | `characters/cosmetics.ts` |
| 商店与旅行插画使用的有缓存上限的静态装扮预览 | `skin-preview.ts` |

景物组件在深度为零的位置生成可复用几何体。`scenes/index.ts` 将这些模板保存在渲染器上，并在每一帧沿当前路线放置。修改共享绘制代码时，必须保留面的顺序、图层和捕获标志：它们决定屋顶可见性、木栈道支撑结构和预览渲染。

在工作区根目录运行 `npm test`、`npm run test:types`、`npm run build`，以及有轮次上限的 `npm run test:fuzz`。QA 编译器会跟踪本地 TypeScript 导入，模糊测试报告会包含提取出的源模块哈希。
