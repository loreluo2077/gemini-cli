# Gemini CLI：服务条款和隐私声明

Gemini CLI 是一款开源工具，可让您直接从命令行界面与 Google
强大的语言模型进行交互。适用于您使用 Gemini CLI
的服务条款和隐私声明取决于您用于向 Google 进行身份验证的帐户类型。

本文概述了适用于不同身份验证方法的具体条款和隐私政策。

## 1. 使用 Google 登录（个人版 Gemini Code Assist）

对于使用其 Google 帐户进行身份验证以访问个人版 Gemini Code Assist 的用户：

- 服务条款：您对 Gemini CLI 的使用受一般
  [Google 服务条款](https://policies.google.com/terms?hl=zh-CN)的约束。
- 隐私声明：您的数据收集和使用在[个人版 Gemini Code Assist 隐私声明](https://developers.google.com/gemini-code-assist/resources/privacy-notice-gemini-code-assist-individuals)中有所描述。

## 2. Gemini API 密钥（使用 Gemini 开发者 [API](https://ai.google.dev/gemini-api/docs) a：免费服务，b：付费服务）

如果您使用 Gemini API 密钥进行身份验证，则以下条款适用：

- 服务条款：您的使用受
  [Gemini API 服务条款](https://ai.google.dev/gemini-api/terms)的约束。适用于 a.
  [免费服务](https://ai.google.dev/gemini-api/terms#unpaid-services) 或 b.
  [付费服务](https://ai.google.dev/gemini-api/terms#paid-services)
- 隐私声明：有关数据处理和隐私的信息在一般
  [Google 隐私权政策](https://policies.google.com/privacy)中详细说明。

## 3. 使用 Google 登录（适用于 Workspace 或获得许可的 Code Assist 用户）

对于标准版或企业版 Gemini Code Assist 的用户：

- 服务条款：[Google Cloud Platform 服务条款](https://cloud.google.com/terms)管辖您对该服务的使用。
- 隐私声明：您的数据处理在
  [Gemini Code Assist 隐私声明](https://developers.google.com/gemini-code-assist/resources/privacy-notices)中有所概述。

## 4. Vertex AI（使用 Vertex AI Gen [API](https://cloud.google.com/vertex-ai/generative-ai/docs/reference/rest)）

如果您将 API 密钥与 Vertex AI Gen API 后端一起使用：

- 服务条款：您的使用受
  [Google Cloud Platform 服务条款](https://cloud.google.com/terms/service-terms/)的约束。
- 隐私声明：[Google Cloud 隐私声明](https://cloud.google.com/terms/cloud-privacy-notice)描述了您的数据是如何收集和管理的。

### 使用情况统计信息选择退出

您可以按照此处提供的说明选择不向 Google
发送使用情况统计信息：[使用情况统计信息配置](./cli/configuration.zh.md#usage-statistics)。

## Gemini CLI 常见问题解答 (FAQ)

### 1. 我的代码，包括提示和答案，是否用于训练 Google 的模型？

这完全取决于您使用的身份验证方法类型。

- **身份验证方法 1：** 是的。当您使用个人 Google 帐户时，适用个人版 Gemini Code
  Assist 隐私声明。根据此声明，您的 **提示、答案和相关代码会被收集**
  并可能用于改进 Google 的产品，其中包括模型训练。
- **身份验证方法 2a：** 是的。当您使用 Gemini API 密钥时，适用 Gemini
  API（免费服务）条款。根据此声明，您的 **提示、答案和相关代码会被收集**
  并可能用于改进 Google 的产品，其中包括模型训练。
- **身份验证方法 2b、3 和 4：** 否。对于这些帐户，您的数据受 Google Cloud 或
  Gemini
  API（付费服务）条款的约束，这些条款将您的输入视为机密信息。您的代码、提示和其他输入
  **不会** 用于训练模型。

### 2. 什么是"使用情况统计信息"，选择退出控制什么？

"使用情况统计信息"设置是 Gemini CLI
中所有可选数据收集的单一控件。它收集的数据取决于您的帐户类型：

- **身份验证方法 1：** 启用后，此设置允许 Google
  收集匿名遥测数据（如运行的命令和性能指标）和 **您的提示和答案** 以改进模型。
- **身份验证方法 2a：** 启用后，此设置允许 Google
  收集匿名遥测数据（如运行的命令和性能指标）和 **您的提示和答案**
  以改进模型。禁用后，我们将按照[Google 如何使用您的数据](https://ai.google.dev/gemini-api/terms#data-use-unpaid)中所述使用您的数据。
- **身份验证方法 2b：** 此设置仅控制匿名遥测数据的收集。Google
  会在有限的时间内记录提示和响应，仅用于检测违反禁止使用政策的行为以及任何必需的法律或法规披露。
- **身份验证方法 3 和 4：**
  此设置仅控制匿名遥测数据的收集。无论此设置如何，您的提示和答案都不会被收集。

您可以按照[使用情况统计信息配置](./cli/configuration.zh.md#usage-statistics)文档中的说明为任何帐户类型禁用使用情况统计信息。
