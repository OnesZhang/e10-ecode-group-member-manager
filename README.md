# e10-ecode-group-member-manager

A **Weaver e-cology 10 (E10) e-code** app that lets business / module admins manage
members of their **public groups** from a lightweight, self-service page — **no admin
backend access required**.

The page is **parameter-driven**: different entry buttons pass different `groupIds`,
so one codebase serves as a dedicated "member management" page for every module,
department or business team.

| | |
|---|---|
| Platform | Weaver e-cology 10 · e-code 二次开发 |
| UI | React (plain JS) · fully localized in English |
| Style | aligned with the E10 native group-management page |
| Auth | same-origin calls, browser session cookie |

---

## Why this project exists / 为什么做这个项目

E10 already ships a built-in "Group Management" page — so why build another one?

### Problems with the built-in backend page (EN)

1. **Backend-only, no self-service.** The built-in feature lives inside the admin
   backend. Business / module admins usually have **no backend access at all**, so
   every member change becomes an IT ticket.
2. **Tedious multi-step flow.** Even with backend access you must: open the group →
   enter "Member Management" → search the person in a heavy picker → save. For
   frequent changes this is painfully slow.
3. **Uncontrollable permissions.** Backend accounts are coarse-grained. Granting
   business users backend access exposes far more than member management (org tree,
   users, workflows, security settings) — a compliance and safety risk. The platform
   has no "members-only" permission scope.
4. **Not scoped to a module.** The built-in page shows *all* groups and mixes private
   groups, public groups, owners, visibility and auto-config — module admins see too
   much and cannot be limited to just their own groups.
5. **Cannot be embedded.** Backend pages can't be embedded into the portal or a
   business page, so admins must leave their working context to manage members.
6. **Heavy member picker.** The built-in person selector has many steps; business
   users expect type-to-search and click-to-add.
7. **Fixed, rigid UI.** Columns, fields, hidden items and styling cannot be adjusted
   to match how the business actually works.
8. **Low-risk, upgrade-safe.** This project deliberately avoids touching the platform
   core: it is built purely with e-code (E10's official secondary-development
   capability) on official HTTP APIs — no core patches, upgrades stay clean.

### 中文：为什么做这个项目

1. **只能后台操作、无法自助**：泛微自带的群组管理在管理后台里，业务/模块管理员
   通常没有后台权限，每次调整成员都要提工单找 IT。
2. **操作繁琐**：即使有后台权限，也要"点群组 → 成员管理 → 重选人器"多步才能
   增删成员，高频调整效率很低。
3. **权限不可控**：后台账号权限粗放，给业务人员开后台上限太大（组织、人员、
   流程、安全都能碰到），合规与安全风险高；平台没有"只允许改群组成员"这种
   细粒度权限。
4. **无法按模块隔离**：官方页面展示全部群组，私人组/公共组、群主、可见范围、
   自动配置混在一起，模块管理员看到大量无关信息，无法只看自己负责的群组。
5. **无法嵌入业务页面**：后台功能不能嵌入门户或业务页面，管理员要离开工作
   场景去后台操作。
6. **选人交互重**：官方选人器步骤多，缺少"输入即搜、点选即加"的快捷体验。
7. **界面固定不可定制**：样式、字段、隐藏项都不能按实际业务流程调整。
8. **低风险、可升级**：用 e-code 标准二开能力 + 官方 HTTP 接口实现，不改平台
   核心、不打补丁，升级无忧。

---

## Features

- **Parameter-driven groups** — the entry passes `groupIds` (comma-separated); the
  page shows exactly those **public** groups, in order.
- **Expand to manage** — click a row to expand members inline; add / remove members
  without leaving the list.
- **Quick person search** — type name / pinyin / account / email / mobile →
  debounced quick search → tick → add.
- **Remove with confirmation** — one-click remove with a confirm dialog; the member
  count updates live.
- **Search & filter** — filter groups by name/creator, filter members by
  name/department/position.
- **E10-native look & feel** — page background, table header, row height, primary
  color and borders follow the official group-management page.
- **Empty state & guards** — no params → a clear "no parameters received" hint;
  unknown group IDs → an explicit notice listing the missing IDs.

---

## How it works

```
e-builder button (implicit params: groupIds)
        │  sessionStorage.jumplinkParams
        ▼
/sp/custom/group-member-manager/members   ← e-code page (this app)
        │  same-origin fetch (browser session cookie)
        ▼
E10 HTTP APIs (public groups / members / add / remove / person search)
```

- **Auth**: same-origin calls — the browser automatically carries the login session
  cookie. No tokens, no allow-lists, no extra configuration.
- **UI**: plain React class component + hand-written CSS (no heavy UI library),
  compiled into a standard e-code import package.

---

## Deployment

1. **Build** the import package with the e-code frontend tooling
   (`ecodecmd-e10 compile && ecodecmd-e10 build`) and **import** it into an E10
   e-code project (new app or overwrite). The ids in `build.json` are intentionally
   blank — they are auto-generated on the first build.
2. **Release** the app so the route `/sp/custom/group-member-manager/members`
   goes live.
3. In **e-builder**, add a button with "Open Page" → target
   `/sp/custom/group-member-manager/members` → **Implicit params**:
   - `groupIds` = comma-separated public group IDs to manage (e.g. `1001,1002`).
4. Done — every button/page that passes different `groupIds` becomes its own
   member-management entry, with zero extra code.

## Parameters

| Param      | Required | Description |
|------------|----------|-------------|
| `groupIds` | **Yes**  | Comma-separated public group IDs shown on this page. Empty → the page shows a "no parameters received" hint. |

Implicit params (e-builder "Open Page - Implicit Params") are the recommended way;
a URL fallback `?groupIds=...` is also supported.

## Platform APIs used

All `POST`, same-origin. Auth via the browser session cookie.

| Purpose | Endpoint |
|---------|----------|
| List public groups | `/api/bs/hrm/channel/list` |
| List group members | `/api/bs/hrm/group/queryUser` |
| Add members | `/api/bs/hrm/group/addUserLink` |
| Remove members | `/api/bs/hrm/group/deleteUserLink` |
| Quick person search | `/api/hrm/common/browser/data/resource` |

---

## Project structure

```
.
├── entry.js                    # route registration: /sp/custom/group-member-manager/members
├── index.js                    # default export of the page component
├── build.json                  # e-code app config (ids auto-generated on build)
├── coms/
│   └── GroupMemberManager.js   # page component: list / expand / add / remove / modal / toast
├── styles/
│   └── group-member-manager.css
├── utils/
│   ├── api.js                  # thin wrappers for the five E10 APIs above
│   └── implicitParams.js       # reads e-builder implicit params
└── config/                     # empty e-code generated config placeholders
```

## License

[MIT](./LICENSE)
