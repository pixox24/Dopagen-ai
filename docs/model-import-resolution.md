# 模型导入 - 动态分辨率配置

## 功能说明

优化后的 ModelImport 支持自动识别 BizyAir API 中的 `width/height` 字段，并配置为动态分辨率映射。

## 工作原理

### 1. 自动识别字段

当粘贴 BizyAir JSON 时，系统会自动检测以下字段：

```javascript
// 示例 BizyAir 请求
{
  "web_app_id": 46957,
  "input_values": {
    "17:BizyAir_Seedream5.prompt": "a photo of...",
    "17:BizyAir_Seedream5.size": "Custom",
    "17:BizyAir_Seedream5.custom_width": 2048,   // ← 自动识别为 width
    "17:BizyAir_Seedream5.custom_height": 2048   // ← 自动识别为 height
  }
}
```

支持的字段格式：
- `width`, `custom_width`, `img_width`
- `height`, `custom_height`, `img_height`
- `size` (值为 "Custom" 时触发动态配置)

### 2. 动态计算逻辑

用户在 Generate 页面选择 **Ratio** 和 **Quality** 后，系统从 `RESOLUTION_MAP` 自动计算宽高：

```typescript
// 用户选择: Ratio = "2:3", Quality = "2K"
// 计算结果: width = 1365, height = 2048

const RESOLUTION_MAP = {
  '2:3': {
    '1K': { w: 683, h: 1024 },
    '2K': { w: 1365, h: 2048 },  // ← 使用这个
    '4K': { w: 2731, h: 4096 },
  }
}
```

### 3. 配置界面

导入模型时会显示配置面板：

```
┌─────────────────────────────────────┐
│  Dynamic Resolution Configured      │
├─────────────────────────────────────┤
│  Default Ratio: [ 2:3 ▼]            │
│  Default Quality: [ High (2K) ▼]    │
├─────────────────────────────────────┤
│  Default size: 1365 x 2048px        │
└─────────────────────────────────────┘
```

### 4. 生成的 Schema

导入后，模型 Schema 中的 width/height 字段会被标记为：

```typescript
{
  key: "17:BizyAir_Seedream5.custom_width",
  label: "Width (Auto)",
  type: "hidden",
  mapping: "width",  // ← 绑定到全局 width 状态
}

{
  key: "17:BizyAir_Seedream5.custom_height", 
  label: "Height (Auto)",
  type: "hidden",
  mapping: "height", // ← 绑定到全局 height 状态
}
```

## 使用步骤

1. **复制 BizyAir 代码**
   ```javascript
   // 从 BizyAir 复制 fetch 代码片段
   const response = await fetch('https://api.bizyair.cn/...', {
     body: JSON.stringify({
       "web_app_id": 46957,
       "input_values": { ... }
     })
   });
   ```

2. **粘贴到 ModelImport 页面**
   - 系统会自动解析 JSON
   - 识别 width/height 字段

3. **配置默认参数**
   - 选择默认 Ratio（如 2:3）
   - 选择默认 Quality（如 2K）
   - 预览计算出的默认尺寸

4. **保存模型**
   - 模型会存储默认参数
   - 使用时自动应用动态分辨率

## 在 Generate 页面的行为

当用户使用此模型生成图片时：

1. **选择 Ratio** → 如 `2:3`
2. **选择 Quality** → 如 `2K`
3. **系统自动计算**
   ```typescript
   // 提交到 API 时
   {
     "17:BizyAir_Seedream5.custom_width": 1365,
     "17:BizyAir_Seedream5.custom_height": 2048
   }
   ```

## 支持的 Ratio

```
1:1, 3:2, 2:3, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9
```

## 支持的 Quality

```
1K: 1024px 基准
2K: 2048px 基准
4K: 4096px 基准
```

## 代码示例

### 原始 BizyAir 请求
```javascript
{
  "web_app_id": 46957,
  "input_values": {
    "17:BizyAir_Seedream5.prompt": "portrait photo...",
    "17:BizyAir_Seedream5.size": "Custom",
    "17:BizyAir_Seedream5.custom_width": 2048,
    "17:BizyAir_Seedream5.custom_height": 2048
  }
}
```

### 用户选择 2:3 + 2K 后的实际请求
```javascript
{
  "web_app_id": 46957,
  "input_values": {
    "17:BizyAir_Seedream5.prompt": "portrait photo...",
    "17:BizyAir_Seedream5.size": "Custom",
    "17:BizyAir_Seedream5.custom_width": 1365,  // ← 自动计算
    "17:BizyAir_Seedream5.custom_height": 2048  // ← 自动计算
  }
}
```

## 注意事项

1. **字段识别**: 系统会自动识别各种命名格式的 width/height 字段
2. **Custom 模式**: 只有当 `size` 字段值为 "Custom" 时才会启用动态配置
3. **默认值**: 导入时设置的 Ratio/Quality 会作为模型的默认配置
4. **实时计算**: 实际生成时根据用户实时选择的 Ratio/Quality 计算尺寸
