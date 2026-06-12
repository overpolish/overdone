const CONFIG = {
  constants: {
    androidAdaptiveDirs: [
      "mipmap-anydpi-v26",
      "mipmap-hdpi",
      "mipmap-mdpi",
      "mipmap-xhdpi",
      "mipmap-xxhdpi",
      "mipmap-xxxhdpi",
    ],
    macosCornerRadiusPercent: 0.2237,
    targetSize: 1024,
  },
  dirs: {
    androidRes: "src-tauri/gen/android/app/src/main/res",
    assets: "assets",
    iosIcons: "src-tauri/gen/apple/Assets.xcassets/AppIcon.appiconset",
    tauriIcons: "src-tauri/icons",
    temp: "assets/.temp-icons",
  },
  files: {
    androidBackgroundXml: "values/ic_launcher_background.xml",
    generatedIcns: "icon.icns",
    macosIcns: "icon.macOS.icns",
  },
  platform: {
    android: {
      name: "Android",
      padding: 0.25,
      prerequisite: "src-tauri/gen/android",
    },
    ios: { name: "iOS", padding: 0.1, prerequisite: "src-tauri/gen/apple" },
    macos: {
      name: "macOS",
      padding: 0.1,
      prerequisite: "src-tauri/tauri.macos.conf.json",
    },
    windows: { name: "Windows", padding: 0.05 },
  },
} as const;

export default CONFIG;
