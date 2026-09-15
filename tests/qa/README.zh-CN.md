# 跨平台 QA

[English](README.md) | [简体中文](README.zh-CN.md)

使用 Node 24，在仓库根目录执行命令。通用预览直接导入当前 `src/` 游戏源码，不加载 Toy SDK，也不访问云存储；游戏启动前，浏览器存储操作已映射到 `qa-community-seasons-v1:` 前缀。生产游戏的存储键保持不变。

## 构建与检查

```sh
npm run setup
npx playwright install chromium webkit
npm run build
npm run qa:build
npm run qa:test
npm run qa:all
```

构建会将游戏、预览及依赖锁文件的哈希写入 `qa-build-info.json`，并将相同记录嵌入预览 HTML。页面加载时，探针会在 `build` 中保存不可变副本；之后获取较新的清单不会将旧页面标记为新构建。浏览器检查会在启动前拒绝缺失或过期的构建记录；修改源码或依赖后，请重新运行 `npm run qa:build`。编译过程中源码发生变化也会使构建失败，确保报告对应实际生成被测预览的源码。

可分别使用 `qa:web`、`qa:android` 或 `qa:ios`。网页检查使用桌面 Chromium，Android 使用 Chromium 触摸模拟，iOS 使用 WebKit 触摸模拟。每组覆盖英文和简体中文，使用全新浏览器上下文、独立本地服务器，并阻止外部请求。这些是模拟检查，不是真机性能测量。运行器会记录并修正已复现的 WebKit 模拟矛盾：竖屏却报告 90 度方向角；初始化后 WebKit 更换方向对象时，修正仍会生效。正常横屏方向值保持不变。iOS 模拟覆盖点击与界面流程；原生滑动、旋转及性能仍需真机检查。报告和截图保存到 `results/qa/` 下带时间戳的目录。

浏览器冒烟检查会在加载页面前安装 Playwright 时钟，并在开始游戏前暂停该时钟。键盘和触摸事件仍交给真实游戏处理；测试只按明确、有限的时间步长推进动画回调。暂停检查会推进 300ms 并要求距离不变，继续后再推进 250ms 并要求距离增加。Android 英文用例还会在输入序列中等待六秒真实主机时间，确认这个延迟不会让角色移动或结束游戏，避免较慢的 CI 在检查暂停前已撞上随机障碍。报告会将计时和帧数据标为模拟结果，不用于性能测量。交互预览与真机检查工具继续使用正常时钟。

## 交互预览与设备检查

```sh
npm run qa:preview                       # 构建预览：http://localhost:4175/
npm run qa:preview -- --host 0.0.0.0     # 明确向局域网测试手机开放
npm run qa:serve                         # 开发时使用，支持热更新
```

用手机普通浏览器打开指定 QA 预览，保持设备解锁，并先真实触摸游戏，再测量。QA 菜单可导出帧间隔及错误诊断，不包含存档内容。帧数和最大间隔统计重置后的全部可见帧间隔，包括等待第一次回调的时间，内存占用固定。P95 使用 1 毫秒直方图区间的保守上界；超过 60 秒的间隔共用溢出区间，并以实际最大值作为上界。报告会明确说明这一近似方法。性能观察应使用构建后的预览；热更新或桌面模拟结果不能证明真机性能。

Android 需启用 USB 调试、授权本机并打开 Chrome，然后执行 `adb forward tcp:9222 localabstract:chrome_devtools_remote`。iOS 需启用 Safari 网页检查器，并运行本地 Web Inspector 到 CDP 的桥接，例如 `pymobiledevice3 webinspector cdp --host 127.0.0.1 --port 9223`。这些设备工具是外部前置条件，不是游戏依赖。参见 [iOS 桥接工具上游指南](https://github.com/doronz88/pymobiledevice3/blob/master/docs/guides/webview-debugging.md)。

```sh
# 将页面地址替换为手机中实际打开的完整预览地址。
npm run qa:device -- --platform ios --endpoint http://127.0.0.1:9223 --page http://YOUR_LAN_IP:4175/ --action list
npm run qa:device -- --platform ios --endpoint http://127.0.0.1:9223 --page http://YOUR_LAN_IP:4175/ --target TARGET_ID --action status
npm run qa:device -- --platform ios --endpoint http://127.0.0.1:9223 --page http://YOUR_LAN_IP:4175/ --target TARGET_ID --action measure --seconds 10
```

Android 使用 `--platform android` 和对应检查器地址。桥接支持时还可执行 `screenshot`。由于选定地址会写入报告，预览地址不得含有查询参数、凭据或片段标识。发现命令只返回地址完全匹配的目标；每次选定页面的操作都会验证精确框架、QA 标识、独立存储前缀和已禁用的云服务，拒绝缺失或不唯一的目标。命令不会导航、重置游戏进度或操作其他标签页。测量会先验证页面嵌入的构建哈希与当前工作区一致，再重置诊断数据。热更新页面和过期构建会被拒绝；采集期间持续检查页面构建身份，保存前再次检查本地源码。修改后须重新构建并刷新选定页面。状态和截图仍可使用，但会明确标记未构建或过期的来源。页面不可见、失焦或缺少真实用户激活时，测量也会停止。页面不可见、pagehide 和 blur 事件会持续保留到重置诊断数据；即使在两次轮询之间短暂离开并返回，也会使本次采集无效。设备报告保留实际浏览器标识和所选平台；声称真机验证时，应同时保存硬件证据。

同一份 `tests/qa/preview/dist/` 使用相对资源路径，也可部署到已获授权的独立托管预览。不得用它替换生产 Toy 或 `src/dist/`。托管预览须保留访问保护，选定的完整地址只在本地保存。设备检查器支持 Toy 预览外层页面，但拒绝生产 Toy 地址。

## 目录与维护

| 路径 | 用途 |
| --- | --- |
| `preview/` | 引用当前源码的通用预览、独立存档、禁用 Toy SDK、有容量限制的诊断 |
| `web/` | 英文/中文的桌面及触摸浏览器冒烟检查 |
| `devices/` | 明确选择 Android/iOS 目标、受校验的 CDP 操作及协议测试 |
| `tests/` | 存档隔离及预览产物回归测试 |
| `archive/` | 保留为可运行参考的历史专项测试场景 |

生产构建会拒绝导入 `tests/qa/` 或包含 QA 标识字符串。新增测试控制应放在这里，不要加入 `src/`。修改后运行 `npm run build`、`npm test`、`npm run qa:build`、`npm run qa:test` 及相关浏览器组合。游戏逻辑与模糊测试参见 [QA 指南](../../docs/QA.zh-CN.md)。

归档场景保留原行为及独立来源。许可、Android 大字和道具控制预览会在游戏启动前验证完整本地来源，仅重置各自的 QA 存储前缀，保留现有玩家及其他应用的数据。带日期的 iPhone 云端测试也可能使用其隔离的 Toy 测试键。运行前请阅读代码及说明。旧测量日期与特定设备假设只是历史记录，不代表本次验证结果。

```sh
npm run qa:archive:phone:build
npm run qa:archive:iphone:build
node --test tests/qa/archive/phone-cart-fix-qa/*.test.mjs tests/qa/archive/iphone-qa/*.test.mjs
npm run qa:archive:licenses:serve         # 在另一个终端中运行
npm run qa:archive:licenses
npm run qa:archive:android:serve          # 在另一个终端中运行
npm run qa:archive:android
```
