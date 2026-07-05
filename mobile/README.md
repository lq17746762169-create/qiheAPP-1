# 构建 Android Release APK

本目录为 Capacitor Android 套壳，Web 资源来自 `../app/`。

## 前置条件

- Node.js 18+
- Java 17（Android Studio 自带 JBR 即可）
- Android SDK（Android Studio 安装后位于 `~/Library/Android/sdk`）

## 构建 Release APK

```bash
cd mobile
npm install
bash scripts/build-release.sh
```

成功后 APK 位于：

```
dist/qihe-release.apk
```

## 配置线上后端（可选）

编辑 `app/config.js` 填入 Render 部署后的 HTTPS 地址，再重新执行构建脚本。

不配置时：对话/审查走直连 Dify，模板走内嵌数据，无需同一 Wi-Fi。

## 手动同步

```bash
cd mobile
npx cap sync android
npx cap open android   # 用 Android Studio 打开
```

## 签名说明

首次构建会自动生成 `android/qihe-release.jks`（密码默认 `qihe2026`，仅用于开发测试）。

正式发布请更换为自己的签名证书，并将密码通过环境变量传入：

```bash
export KEYSTORE_PASSWORD=你的密码
export KEY_PASSWORD=你的密码
bash scripts/build-release.sh
```
