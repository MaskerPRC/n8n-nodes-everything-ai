# EverythingAI 节点功能特性完整清单

## 一、核心功能

### 1. 自然语言驱动
- **功能描述**：用自然语言描述数据处理需求，无需编写代码
- **输入方式**：在 "Your Requirement" 字段中输入自然语言指令
- **指令格式**：
  - 使用数字 1, 2, 3... 指代输入端口
  - 使用大写字母 A, B, C... 指代输出端口
  - 示例：`"When status='paid' in input 1 data, send to output A, otherwise send to output B"`

### 2. 自动代码生成
- **技术实现**：使用 LLM（大语言模型）自动生成 JavaScript 代码
- **代码格式**：生成符合 n8n 数据格式的代码（包含 json 和 binary 字段）
- **代码执行**：在安全的执行环境中运行生成的代码
- **支持异步**：支持 async/await 和 Promise，可执行异步操作（HTTP 请求、文件 I/O 等）

### 3. 智能代码缓存
- **自动缓存**：生成的代码自动保存到本地文件系统
- **缓存位置**：`~/.n8n/everythingAI/{workflowId}/{nodeId}/`
- **缓存文件**：
  - `code.js` - 生成的代码
  - `schema.json` - 输出数据结构定义
  - `meta.json` - 元数据（指令、输入输出数量、模型、安全设置等）
- **自动重新生成触发条件**：
  - 需求（instruction）改变
  - 输入端口数量改变
  - 输出端口数量改变
  - 安全设置（enableSecurityCheck）改变
  - 手动强制重置（Force Reset Node）

### 4. 动态输入/输出端口
- **端口数量**：支持 1-10 个输入端口和 1-10 个输出端口
- **动态配置**：通过配置选项动态设置端口数量
- **实时更新**：修改端口数量后，节点界面实时显示对应数量的端口
- **技术实现**：使用 n8n 表达式动态配置端口

## 二、LLM 集成

### 1. 多模型支持
- **API 兼容性**：支持 OpenAI 兼容的 API
- **动态模型加载**：自动从 API 获取可用模型列表
- **模型过滤**：自动过滤聊天模型（gpt-*, claude-*, *chat*, *instruct* 等）
- **自定义模型**：支持使用自定义模型名称
- **默认模型**：未选择模型时默认使用 `gpt-4o-mini`

### 2. 模型选择方式
- **下拉选择**：从动态加载的模型列表中选择
- **自定义输入**：选择 "Custom" 后输入自定义模型名称
- **表达式支持**：支持使用 n8n 表达式指定模型 ID

### 3. Prompt 工程
- **系统 Prompt**：精心设计的系统提示词，包含：
  - 输入/输出约定说明
  - 数据结构描述
  - 代码要求
  - 安全限制（如果启用）
  - 路由规则说明
  - 多个代码示例
- **用户 Prompt**：自动分析输入数据结构并生成用户提示词
- **自定义 Prompt**：支持自定义系统 Prompt 模板
  - 占位符：`{{instruction}}`, `{{inputCount}}`, `{{outputCount}}`
- **Temperature**：LLM 调用温度设置为 0.1（低随机性，更稳定）

## 三、Node.js 模块支持

### 1. 内置模块支持
生成的代码可以使用所有 Node.js 内置模块，通过 `require` 引入：

**网络模块**：
- `http`, `https` - HTTP/HTTPS 请求
- `net`, `dgram`, `dns`, `tls` - 网络相关

**文件系统模块**：
- `fs`, `path` - 文件系统操作

**工具模块**：
- `crypto` - 加密解密
- `url`, `querystring` - URL 处理
- `util`, `buffer`, `stream`, `zlib`, `string_decoder` - 工具类

**系统模块**：
- `os` - 操作系统信息
- `process` - 进程信息（全局，无需 require）

**异步模块**：
- `events`, `timers` - 事件和定时器

**进程模块**：
- `child_process`, `cluster`, `worker_threads` - 进程和线程

**其他模块**：
- `readline`, `repl`, `tty`, `vm` - 其他功能

### 2. 模块注入机制
- **自定义 require**：提供自定义 require 函数，注入所有 Node.js 内置模块
- **执行环境**：在安全的执行环境中运行，支持 async/await

## 四、安全功能

### 1. 安全检查（默认启用）
- **默认状态**：安全检查默认启用（`enableSecurityCheck: true`）
- **可配置**：可在高级设置中关闭安全检查

### 2. 安全检查启用时的限制
**禁止的操作**：
- 文件删除操作（`fs.unlink`, `fs.rmdir`, `fs.rm` 等）
- 目录删除操作
- 文件写入操作（`fs.writeFile`, `fs.appendFile` 等）
- 系统文件操作
- 读取敏感文件：
  - 系统关键文件（`/etc/passwd`, `/etc/shadow`, `/etc/ssh/` 等）
  - SSH 密钥和私钥（`.ssh/id_rsa`, `.ssh/id_ed25519` 等）
  - 凭证和密钥目录（`.aws/`, `.kube/`, `.docker/`, `.gnupg/` 等）
  - 密码文件、令牌文件、密钥文件（`*.pem`, `*.key`, `*.p12` 等）
  - 环境变量中的敏感信息（`PASSWORD`, `SECRET`, `KEY`, `TOKEN`, `API_KEY` 等）

**允许的操作**：
- 读取非敏感文件
- HTTP 请求
- 数据处理和转换
- 创建新数据结构

### 3. 安全检查关闭时的行为
- **遵循用户指令**：必须严格遵循用户指令
- **允许大多数操作**：
  - 所有读取操作（包括敏感文件、密码、密钥等）
  - 文件写入操作
  - 文件删除操作
  - 大多数系统操作
- **仍被阻止的操作**：
  - 可能摧毁整个系统的操作（格式化磁盘、删除根目录 `/` 等）
  - 可能导致大规模系统损坏的操作（删除 `/usr`, `/bin`, `/sbin`, `/etc` 等）

### 4. 双重安全检查机制
- **LLM 层面**：在 Prompt 中明确安全限制，LLM 生成代码时拒绝危险操作
- **代码执行层面**：代码执行前进行正则表达式检查，拦截危险操作
- **极端危险操作**：即使安全检查关闭，仍会阻止极端危险操作（删除根目录、格式化磁盘等）

## 五、路由功能

### 1. 条件路由
- **功能**：根据条件将数据路由到不同的输出端口
- **示例**：`"When status='paid' in input 1 data, send to output A, otherwise send to output B"`

### 2. 选择性路由
- **功能**：只激活特定路由，其他路由保持空
- **语法**：`"go to route X"` 或 `"走 X 路线"`
- **行为**：
  - 选中的路由至少输出一个数据项（即使为空 `{ json: {}, binary: {} }`）
  - 未选中的路由保持空数组
  - 确保 n8n 工作流能正确执行

### 3. 停止工作流
- **功能**：在特定条件下停止工作流执行
- **语法**：`"stop at this node"` 或 `"停在这个节点"`
- **行为**：所有输出端口保持空数组，不输出任何数据

### 4. 数据转发
- **功能**：将输入数据转发到输出端口
- **保持结构**：完整保留数据项结构（包括 json 和 binary 字段）

## 六、数据处理能力

### 1. 数据转换
- **字段添加**：添加新字段到数据项
- **字段修改**：修改现有字段值
- **字段删除**：删除字段（通过不包含在输出中）
- **数据过滤**：根据条件过滤数据项

### 2. 数据合并
- **多输入合并**：合并多个输入端口的数据
- **数据去重**：去除重复数据项

### 3. 数据增强
- **HTTP 请求**：通过 HTTP/HTTPS 请求获取外部数据并合并
- **文件读取**：读取文件内容并添加到数据项
- **计算字段**：基于现有字段计算新字段

## 七、高级功能

### 1. 自定义 Prompt 模板
- **功能**：覆盖默认系统 Prompt
- **占位符**：
  - `{{instruction}}` - 用户需求
  - `{{inputCount}}` - 输入端口数量
  - `{{outputCount}}` - 输出端口数量
- **用途**：自定义代码生成逻辑，适应特定需求

### 2. 强制重置节点
- **功能**：强制清除缓存的代码并重新生成
- **使用场景**：
  - 代码生成有问题需要重新生成
  - 想要使用新的 LLM 模型重新生成
  - 测试不同的 Prompt 模板

### 3. 状态管理
- **Building 状态**：首次执行或需要重新生成代码时
- **Prepared 状态**：代码已生成并缓存，可直接执行
- **自动检测**：自动检测配置变化并触发重新生成

## 八、技术特性

### 1. 执行环境
- **沙箱执行**：在安全的执行环境中运行生成的代码
- **异步支持**：完整支持 async/await 和 Promise
- **错误处理**：详细的错误信息，包括生成的代码、提取的函数体、输入数据等

### 2. 数据格式
- **输入格式**：`inputs[0]`, `inputs[1]` 等，每个是数据项数组
- **数据项格式**：`{ json: {...}, binary: {...} }`
- **输出格式**：`{ "A": [...], "B": [...], ... }`，键是输出端口字母，值是数据项数组

### 3. 文件系统存储
- **存储位置**：`~/.n8n/everythingAI/{workflowId}/{nodeId}/`
- **文件结构**：
  - `code.js` - 生成的代码
  - `schema.json` - 输出数据结构
  - `meta.json` - 元数据
- **跨平台**：支持 Windows、Linux、macOS

### 4. 错误处理
- **验证**：执行前验证代码格式
- **错误信息**：详细的错误信息，帮助调试
- **回退机制**：代码生成失败时的处理

## 九、使用场景

### 1. 数据路由
- 根据条件将数据分发到不同处理流程
- 实现复杂的分支逻辑

### 2. 数据转换
- 数据格式转换
- 字段映射和重命名
- 数据清洗和验证

### 3. 数据增强
- 通过 API 获取外部数据
- 读取文件并合并数据
- 计算衍生字段

### 4. 条件处理
- 根据数据内容执行不同逻辑
- 实现复杂的业务规则

### 5. 系统操作
- 文件操作（读取、写入、删除）
- 网络请求
- 系统信息获取

## 十、限制和注意事项

### 1. 环境要求
- **n8n 版本**：1.0.0 或更高
- **文件系统访问**：需要本地文件系统访问权限
- **自托管**：设计用于自托管 n8n 实例
- **n8n Cloud**：可能无法在 n8n Cloud 中使用（文件系统限制）

### 2. 代码要求
- **返回格式**：必须返回对象，格式为 `{ "A": [...], "B": [...], ... }`
- **数据项格式**：必须包含 `json` 和 `binary` 字段
- **异步操作**：必须使用 async/await 或 Promise，不能使用阻塞模式

### 3. 性能考虑
- **首次执行**：需要调用 LLM 生成代码，可能较慢
- **后续执行**：直接执行缓存的代码，速度快
- **代码缓存**：代码缓存在本地，不占用 API 调用

### 4. 安全考虑
- **默认安全**：安全检查默认启用
- **敏感操作**：需要明确关闭安全检查才能执行
- **责任**：用户需对关闭安全检查后的操作负责

## 十一、配置参数完整列表

### 基础配置
1. **Number of Inputs** (numberInputs)
   - 类型：options (1-10)
   - 默认值：1
   - 描述：选择输入端口数量

2. **Number of Outputs** (numberOutputs)
   - 类型：options (1-10)
   - 默认值：1
   - 描述：选择输出端口数量

3. **Your Requirement** (instruction)
   - 类型：string (多行)
   - 必填：是
   - 描述：自然语言需求描述

4. **Model Name or ID** (model)
   - 类型：options (动态加载)
   - 必填：是
   - 描述：选择 LLM 模型

5. **Custom Model Name** (customModel)
   - 类型：string
   - 显示条件：model === 'custom'
   - 描述：自定义模型名称

### 高级配置
6. **Custom Prompt Template** (customPrompt)
   - 类型：string (多行)
   - 描述：自定义系统 Prompt 模板

7. **Force Reset Node** (reset)
   - 类型：boolean
   - 默认值：false
   - 描述：强制重置节点

8. **Enable Security Check** (enableSecurityCheck)
   - 类型：boolean
   - 默认值：true
   - 描述：启用安全检查

## 十二、版本信息

- **当前版本**：0.6.5
- **节点版本**：1
- **许可证**：MIT
- **仓库**：https://github.com/MaskerPRC/n8n-nodes-everything-ai
- **npm 包名**：n8n-nodes-everything-ai

## 十三、技术架构

### 1. 代码结构
- **主节点文件**：`nodes/EverythingAI/EverythingAi.node.ts`
- **LLM 集成**：`nodes/EverythingAI/shared/llm.ts`
- **工具函数**：`nodes/EverythingAI/shared/utils.ts`
- **凭证**：`credentials/OpenAIApi.credentials.ts`

### 2. 依赖
- **n8n-workflow**：n8n 工作流核心库
- **Node.js 内置模块**：所有标准内置模块

### 3. 构建
- **TypeScript**：使用 TypeScript 开发
- **构建工具**：n8n-node CLI
- **输出目录**：`dist/`

## 十四、示例场景

### 场景 1：订单路由
**需求**：`"When order status is 'paid', send to output A, otherwise send to output B"`
- 根据订单状态路由到不同处理流程

### 场景 2：数据增强
**需求**：`"For each item in input 1, fetch data from https://api.example.com/user/{userId} and add to output A"`
- 通过 API 获取外部数据并合并

### 场景 3：文件处理
**需求**：`"Read all files from /path/to/directory and output file contents to A"`
- 读取目录中的所有文件

### 场景 4：条件停止
**需求**：`"If input 1 contains items with status='error', stop at this node"`
- 遇到错误时停止工作流

### 场景 5：数据转换
**需求**：`"Add field 'processedAt' with current timestamp to all items from input 1, output to A"`
- 添加时间戳字段

## 十五、最佳实践

### 1. 需求描述
- 使用清晰、具体的语言
- 明确指定输入和输出端口
- 说明条件和逻辑

### 2. 安全使用
- 默认保持安全检查启用
- 仅在必要时关闭安全检查
- 关闭后谨慎使用

### 3. 性能优化
- 利用代码缓存机制
- 避免频繁修改需求
- 使用合适的 LLM 模型

### 4. 错误处理
- 检查生成的代码
- 查看详细的错误信息
- 使用强制重置功能重新生成

