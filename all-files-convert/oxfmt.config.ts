import { defineConfig } from "oxfmt";

export const ignorePatterns = [
  ".github/**",
  "src/handlers/index.ts",
  "test/resources/**",
  "src/handlers/code/**",
  "src/handlers/lua/**",
  "src/handlers/minecraft/**",
  "src/handlers/roblox/**",
  "src/handlers/hytale/**",
  "src/handlers/azw3/**",
  "src/handlers/libopenmpt/**",
  "src/handlers/midi/**",
  "src/handlers/pandoc/**",
  "src/handlers/envelope/**",
  "src/handlers/espeakng.js/**",
  "src/handlers/gimper/**",
  "src/handlers/image-to-txt/**",
  "src/handlers/qoa-fu/**",
  "src/handlers/qoi-fu/**",
  "src/handlers/rpgmvp-decrypter/**",
  "src/handlers/sppd/**",
  "src/handlers/terraria-wld-parser/**",
  "src/handlers/turbowarp/**",
];

export default defineConfig({ ignorePatterns });
