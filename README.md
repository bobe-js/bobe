# Bobe

一个基于**缩进语法**的前端框架，内置**细粒度响应式信号系统**与**可定制的渲染引擎**。

## 包结构

| 包 | npm | 说明 |
|---|---|---|
| [aoye](packages/signal) | `aoye` | 高效响应式信号库（push-pull 混合调度） |
| [bobe-shared](packages/shared) | `bobe-shared` | 共享工具库 |
| [bobe](packages/compiler) | `bobe` | 缩进语法的模板编译器 + 运行时解释器 |
| [bobe-dom](packages/dom) | `bobe-dom` | DOM 渲染适配器 |

## 开发

```bash
# 安装依赖
pnpm install          

# 构建所有包
pnpm build            

# 运行测试
pnpm -r exec vitest   

# 从模板创建新包
pnpm new              
```

## 发布新包(需 npm 权限)

主仓库遵循多包同版本号管理原则

1. 创建新包

   ```shell
   pnpm new
   # 根据指引填写包名
   ```

2. 手动发布
   ⭐️ 确保发布时版本与 main 分支最新版本相同

   ```shell
   cd 包目录
   
   npm login --registry=https://registry.npmjs.org
   
   npm publish --access public --registry="https://registry.npmjs.org" --no-git-checks
   ```

3. `https://www.npmjs.com/` 找到新包设置 OIDC

   1. 找到 Setting -> Trusted Publisher, 配置如下
      ```shell
      # Organization or user*:
      bobe-js
      
      # Repository*:
      bobe
      
      # Workflow filename*:
      npm-publish.yml
      ```
