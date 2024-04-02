local dap = require("dap")

-- Dart / Flutter
dap.adapters.dart = {
  type = 'executable',
  command = 'dart',
  args = {'debug_adapter'}
}
dap.adapters.flutter = {
  type = 'executable',
  command = 'flutter',
  args = {'debug_adapter'}
}
dap.configurations.dart = {
  {
    type = "dart",
    request = "launch",
    name = "Launch dart",
    dartSdkPath = "/Users/akuzmenko/code/flutter/bin/cache/dart-sdk/bin/dart",
    flutterSdkPath = "/Users/akuzmenko/code/flutter/bin/flutter",
    program = "${workspaceFolder}/lib/main.dart",
    cwd = "${workspaceFolder}",
  },
  {
    type = "flutter",
    request = "launch",
    name = "Launch flutter",
    dartSdkPath = "/Users/akuzmenko/code/flutter/bin/cache/dart-sdk/bin/dart",
    flutterSdkPath = "/Users/akuzmenko/code/flutter/bin/flutter",
    program = "${workspaceFolder}/lib/main.dart",
    cwd = "${workspaceFolder}",
  }
}
