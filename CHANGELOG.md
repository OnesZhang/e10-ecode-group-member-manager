# 更新日志

本项目遵循语义化版本（Semantic Versioning）。

## v1.3.0

- 群组列表精简：隐藏「Creator / Created Time / Operations」三列，展开改为纯行点击（箭头指示），操作更简洁。

## v1.2.0

- 新增 URL 参数 `addSource` 控制「Add Members」弹窗来源：`both`（默认，显示 Internal/External 两个标签）、`internal`、`external`；锁定单一来源时隐藏标签栏，并在弹窗标题旁显示来源徽标。
- 成员面板工具栏重排，消除歧义：「＋ Add Member」移到「Members」标题旁，成员搜索框独立于右侧并改为 `Filter members in this group`，明确其作用为过滤当前列表。

## v1.1.0

- 新增「Internal / External」成员搜索切换：外部联系人搜索改走平台外部组织清单接口，能直接返回**所属企业、部门、Job Title、联系方式**。
- 搜索结果展示优化：内部人员显示「部门 · 岗位」，外部联系人显示「企业 · 部门」。
- 修复路由加载文案为英文（`页面加载中...` → `Loading...`）。
- 界面对齐 E10 官方群组管理页样式，统一为纯英文界面。

## v1.0.0

- 首个版本：公共群组成员管理页面。
- 通过 e-builder「打开页面 - 隐式传参」接收 `groupIds`，展示指定公共群组。
- 支持展开群组查看成员、快捷搜索、添加/移出成员。