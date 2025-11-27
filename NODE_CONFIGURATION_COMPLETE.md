# 节点配置完整列表

## 基础配置

### 1. Number of Inputs (numberInputs)
- **类型**: 选项 (options)
- **默认值**: 1
- **选项**: 1-10
- **必填**: 是
- **说明**: 选择输入端口数量（1-10）。修改此值后，节点会动态显示相应数量的输入端口。

---

### 2. Number of Outputs (numberOutputs)
- **类型**: 选项 (options)
- **默认值**: 1
- **选项**: 1-10
- **必填**: 是
- **说明**: 选择输出端口数量（1-10）。修改此值后，节点会动态显示相应数量的输出端口。

---

### 3. Your Requirement (instruction)
- **类型**: 字符串 (string)
- **默认值**: ''
- **行数**: 4行
- **必填**: 是
- **占位符**: `e.g., When status="paid" in input 1 data, send to output A, otherwise send to output B`
- **说明**: 用自然语言描述数据处理需求。使用数字1,2,3...引用输入，使用大写字母A,B,C...引用输出。如果需要修改逻辑，只需修改此需求，节点会自动重新生成代码。

---

### 4. Data Complexity Level (dataComplexityLevel)
- **类型**: 选项 (options)
- **默认值**: 0
- **选项**:
  - `0 - Structure Only (Default)`: 只提供数据结构/类型，不提供实际数据值。与不配置此选项相同。
  - `1 - Minimal Sample`: 提供1-2个样本项，仅包含关键字段。长文本字段截断到100字符。
  - `2 - Small Sample`: 提供最多5个样本项，包含完整字段。长文本字段截断到500字符。
  - `3 - Medium Sample`: 提供最多10个样本项，包含完整字段。长文本字段截断到1000字符。
  - `4 - Large Sample`: 提供最多50个样本项，包含完整字段。长文本字段截断到2000字符。
  - `5 - Full Data (Not Recommended)`: 提供所有输入数据，不截断。警告：对于大型数据集可能超过token限制。
- **说明**: 控制AI在生成代码时能看到多少实际输入数据。级别越高提供的数据越多，但可能增加token使用量。级别0（默认）只显示数据结构/类型。

---

### 5. Model Name or ID (model)
- **类型**: 选项 (options)
- **默认值**: ''
- **动态加载**: 是（通过 `getModels` 方法）
- **必填**: 是
- **说明**: 选择要使用的LLM模型（从API动态加载）。从列表中选择，或使用<a href="https://docs.n8n.io/code/expressions/">表达式</a>指定ID。

---

### 6. Custom Model Name (customModel)
- **类型**: 字符串 (string)
- **默认值**: ''
- **必填**: 是（当model='custom'时）
- **显示条件**: `model = 'custom'`
- **说明**: 当选择"Custom"模型时，在此处输入模型名称。

---

## 高级设置 (Advanced Settings)

### 7. Custom Prompt Template (customPrompt)
- **类型**: 字符串 (string)
- **默认值**: ''
- **行数**: 6行
- **路径**: `advanced.customPrompt`
- **说明**: 自定义系统提示词模板。留空使用默认模板。可以使用 `{{instruction}}`、`{{inputCount}}`、`{{outputCount}}` 作为占位符。

---

### 8. Force Reset Node (reset)
- **类型**: 布尔值 (boolean)
- **默认值**: false
- **路径**: `advanced.reset`
- **说明**: 是否强制重置节点并清除生成的代码。注意：当指令、输入数量或输出数量更改时，节点会自动重置并重新生成代码。仅在想要在不更改任何配置的情况下强制重置时使用此选项。

---

### 9. Enable Security Check (enableSecurityCheck)
- **类型**: 布尔值 (boolean)
- **默认值**: true
- **路径**: `advanced.enableSecurityCheck`
- **说明**: 启用后，节点将拒绝包含危险操作的代码生成请求，例如文件删除、目录删除、系统文件操作或其他可能有害的写入/删除操作。允许读取操作。

---

## 内置包配置 (Additional Built-in Packages)

### 10. Cheerio (cheerio)
- **类型**: 布尔值 (boolean)
- **默认值**: true
- **路径**: `advanced.additionalBuiltInPackages.cheerio`
- **说明**: 启用/禁用Cheerio - 专为服务器设计的核心jQuery的快速、灵活和精简实现。非常适合HTML/DOM解析和操作。这是一个内置包（本地编译），默认启用。

---

## 外部包配置 (Additional External Packages)

### 11. Playwright (playwright)
- **类型**: 布尔值 (boolean)
- **默认值**: false
- **路径**: `advanced.additionalExternalPackages.playwright`
- **显示条件**: 总是显示（在External Packages下）
- **说明**: 启用Playwright - 用于网页抓取和测试的浏览器自动化库。需要Docker容器和远程执行服务器配置。

---

### 12. Remote Execution Server URL (remoteExecutionServerUrl)
- **类型**: 字符串 (string)
- **默认值**: `tcp://172.18.0.REPLACE_ME:5004`
- **必填**: 是（当playwright=true时）
- **路径**: `advanced.additionalExternalPackages.remoteExecutionServerUrl`
- **显示条件**: `playwright = true`
- **说明**: 远程执行服务器URL。默认：`tcp://172.18.0.REPLACE_ME:5004`（将"REPLACE_ME"替换为您的Docker网络IP，例如1）。对于localhost，使用 `tcp://localhost:5004`。对于远程服务器，使用 `tcp://IP:PORT`。

---

### 13. Remote Execution Password (remoteExecutionPassword)
- **类型**: 字符串 (string, 密码类型)
- **默认值**: `default-password-change-me`
- **必填**: 是（当playwright=true时）
- **路径**: `advanced.additionalExternalPackages.remoteExecutionPassword`
- **显示条件**: `playwright = true`
- **说明**: 用于与远程执行服务器进行身份验证的密码。默认：`default-password-change-me`（在生产环境中更改此值）。

---

### 14. Keep Context (playwrightKeepContext)
- **类型**: 布尔值 (boolean)
- **默认值**: false
- **路径**: `advanced.additionalExternalPackages.playwrightKeepContext`
- **显示条件**: `playwright = true`
- **说明**: 启用后，浏览器上下文（包括cookies、localStorage等）在执行后保持活动状态，可以被下游节点重用。这允许在节点之间维护登录会话。禁用以在每次执行后关闭上下文。

---

### 15. Keep Page (playwrightKeepPage)
- **类型**: 布尔值 (boolean)
- **默认值**: false
- **路径**: `advanced.additionalExternalPackages.playwrightKeepPage`
- **显示条件**: `playwright = true`
- **说明**: 启用后，页面在执行后保持打开状态，可以被下游节点重用。这也会自动启用Keep Context。当禁用但Keep Context启用时，页面将关闭，但上下文（cookies等）将被保留。

---

### 16. Auto Screenshot (playwrightAutoScreenshot)
- **类型**: 布尔值 (boolean)
- **默认值**: true
- **路径**: `advanced.additionalExternalPackages.playwrightAutoScreenshot`
- **显示条件**: `playwright = true`
- **说明**: 启用后，在代码执行结束前自动截取所有打开页面的屏幕截图，并将其作为二进制数据返回。禁用以跳过自动截图。

---

## 新增配置项（待实现）

### 17. Context ID/Name (playwrightContextId) ⚠️ 待实现
- **类型**: 字符串 (string)
- **默认值**: ''
- **路径**: `advanced.additionalExternalPackages.playwrightContextId`
- **显示条件**: `playwright = true AND playwrightKeepContext = true`
- **占位符**: `e.g., 小红书账号1, admin-account`
- **说明**: 
  - **首次执行时**：可选，为第一个Context指定提示名称。如果指定了，LLM会优先使用此名称；如果未指定，LLM会根据业务理解自动命名。
  - **后续执行时**：指定要使用的Context名称。系统会查找匹配的Context（支持部分匹配，使用最新的）。
  - **示例**：`小红书主账号`、`管理员账号`、`测试账号`等。

---

## 配置项层级结构

```
Everything AI Node
├── Number of Inputs (必填)
├── Number of Outputs (必填)
├── Your Requirement (必填)
├── Data Complexity Level
├── Model Name or ID (必填)
├── Custom Model Name (当model='custom'时必填)
└── Advanced Settings
    ├── Custom Prompt Template
    ├── Force Reset Node
    ├── Enable Security Check
    ├── Additional Built-in Packages
    │   └── Cheerio
    └── Additional External Packages
        ├── Playwright
        ├── Remote Execution Server URL (playwright=true时必填)
        ├── Remote Execution Password (playwright=true时必填)
        ├── Keep Context
        ├── Keep Page
        ├── Auto Screenshot
        └── Context ID/Name ⚠️ (待实现，playwright=true AND keepContext=true时显示)
```

---

## 配置项依赖关系

### 显示条件

```
Playwright
  ├── Remote Execution Server URL (显示条件：playwright = true)
  ├── Remote Execution Password (显示条件：playwright = true)
  ├── Keep Context (显示条件：playwright = true)
  │   └── Context ID/Name (显示条件：playwright = true AND keepContext = true) ⚠️ 待实现
  ├── Keep Page (显示条件：playwright = true)
  └── Auto Screenshot (显示条件：playwright = true)
```

### 自动启用关系

```
Keep Page = true
  └── 自动启用 Keep Context = true
```

**说明**：
- 如果 `Keep Page = true`，`Keep Context` 自动也是 `true`
- 即使UI上显示 `Keep Context = false`，实际执行时也是 `true`

---

## 配置项分类

### 必填配置项
1. Number of Inputs
2. Number of Outputs
3. Your Requirement
4. Model Name or ID
5. Custom Model Name (当model='custom'时)
6. Remote Execution Server URL (当playwright=true时)
7. Remote Execution Password (当playwright=true时)

### 可选配置项
- Data Complexity Level
- Custom Prompt Template
- Force Reset Node
- Enable Security Check
- Cheerio
- Playwright
- Keep Context
- Keep Page
- Auto Screenshot
- Context ID/Name ⚠️ (待实现)

---

## 配置示例

### 示例1：基础配置（不使用Playwright）

```
Number of Inputs: 2
Number of Outputs: 2
Your Requirement: "When status='paid' in input 1, send to output A, otherwise send to output B"
Data Complexity Level: 0
Model Name or ID: gpt-4o-mini
Advanced Settings:
  - Enable Security Check: ✓
  - Cheerio: ✓
```

### 示例2：使用Playwright，单账号场景

```
Number of Inputs: 1
Number of Outputs: 1
Your Requirement: "登录小红书并获取首页内容"
Model Name or ID: gpt-4o-mini
Advanced Settings:
  - Additional External Packages:
    - Playwright: ✓
    - Remote Execution Server URL: tcp://localhost:5004
    - Remote Execution Password: my-password
    - Keep Context: ✓
    - Keep Page: ✗
    - Auto Screenshot: ✓
    - Context ID/Name: (留空) ⚠️ 待实现
```

### 示例3：使用Playwright，多账号场景

**节点1（创建账号）**：
```
Playwright: ✓
Keep Context: ✓
Context ID/Name: 小红书主账号 ⚠️ 待实现（可选，给第一个Context的提示名称）
```

**节点2（使用账号）**：
```
Playwright: ✓
Keep Context: ✓
Context ID/Name: 小红书主账号 ⚠️ 待实现（指定使用哪个Context）
```

---

## 注意事项

1. **Context ID/Name配置项尚未实现**：
   - 当前代码中不存在此配置项
   - 需要按照设计文档实现

2. **Keep Page自动启用Keep Context**：
   - 如果 `Keep Page = true`，`Keep Context` 自动也是 `true`
   - 这是代码逻辑，不是UI显示

3. **配置项路径**：
   - Playwright相关配置都在 `advanced.additionalExternalPackages` 下
   - 访问时需要使用完整路径

4. **表达式支持**：
   - 所有字符串类型的配置项都支持n8n表达式
   - 例如：`{{ $json.accountName }}`

