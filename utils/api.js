/**
 * 群组成员管理 - 平台接口封装
 *
 * 鉴权说明：所有接口同源调用，浏览器自动携带登录态 Cookie（ETEAMSID），
 * 无需额外鉴权头，也无准入名单限制（已实测验证）。
 *
 * 接口清单（均已在线实测）：
 * 1. POST /api/bs/hrm/channel/list          公共群组列表
 * 2. POST /api/bs/hrm/group/queryUser       查询群组成员
 * 3. POST /api/bs/hrm/group/addUserLink     添加成员
 * 4. POST /api/bs/hrm/group/deleteUserLink  移出成员
 * 5. POST /api/hrm/common/browser/data/resource  人员快捷搜索
 */

/**
 * 通用 POST 请求封装：同源 + 登录态 Cookie + JSON
 */
export async function postJSON(url, body) {
  const resp = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json;charset=UTF-8' },
    body: JSON.stringify(body || {})
  });
  if (!resp.ok) {
    throw new Error(`请求失败 HTTP ${resp.status}`);
  }
  const json = await resp.json();
  if (json.code !== 200) {
    throw new Error(json.msg || '接口返回失败');
  }
  return json.data;
}

/**
 * 1. 公共群组列表（isPrivate=0 即公共组）
 * @returns {Promise<Array>} 群组数组
 */
export async function fetchPublicGroups() {
  const all = [];
  let current = 1;
  const pageSize = 100;
  // 循环翻页，直到取完（total 有值时按 total 判断，否则按 hasMore）
  for (;;) {
    const data = await postJSON('/api/bs/hrm/channel/list', {
      menuCode: 'myGroup',
      closed: 0,
      isPrivate: 0,
      saMatchType: 'AND',
      saConditionList: [],
      current,
      pageSize
    });
    const pageData = (data && data.data) || [];
    all.push(...pageData);
    const total = data && data.total;
    if (total != null) {
      if (current * pageSize >= total || pageData.length === 0) break;
    } else if (!(data && data.hasMore) || pageData.length === 0) {
      break;
    }
    current += 1;
  }
  return all;
}

/**
 * 2. 查询群组成员
 * @param {string} groupId 群组ID
 * @returns {Promise<Array>} 成员数组
 */
export async function fetchGroupMembers(groupId) {
  const all = [];
  let current = 1;
  const pageSize = 100;
  for (;;) {
    const data = await postJSON('/api/bs/hrm/group/queryUser', {
      menuCode: 'myGroup',
      type: 'group',
      id: groupId,
      index: null,
      containDls: true,
      orderKey: '',
      orderType: '',
      saMatchType: 'AND',
      saConditionList: [],
      current,
      pageSize
    });
    const pageData = (data && data.data) || [];
    all.push(...pageData);
    const total = data && data.total;
    if (total != null) {
      if (current * pageSize >= total || pageData.length === 0) break;
    } else if (pageData.length === 0) {
      break;
    }
    current += 1;
  }
  return all;
}

/**
 * 3. 添加成员
 * @param {string} groupId 群组ID
 * @param {Array<string>} empIds 人员ID数组
 */
export async function addGroupMembers(groupId, empIds) {
  return postJSON('/api/bs/hrm/group/addUserLink', { id: groupId, empIds });
}

/**
 * 4. 移出成员
 * @param {string} groupId 群组ID
 * @param {Array<string>} empIds 人员ID数组
 */
export async function removeGroupMembers(groupId, empIds) {
  return postJSON('/api/bs/hrm/group/deleteUserLink', { id: groupId, empIds });
}

// 外部联系人虚拟组织 ID（租户级，懒获取 + 缓存）
let externalVirtualOrgId = null;

/**
 * 获取「外部联系人」虚拟组织 ID（cmd=external 时 leftData 返回的 defaultVirtualOrg）
 */
export async function ensureExternalVirtualOrgId() {
  if (externalVirtualOrgId) return externalVirtualOrgId;
  const data = await postJSON('/api/hrm/common/browser/leftData/resource', {
    browserMultiple: true,
    authWecahtBook: false,
    wxDepNeedConvertCount: 0,
    wxEmpNeedConvertCount: 0,
    wxTotalNeedConvertCount: 0,
    hideManager: '1',
    cmd: 'external',
    callData: true,
    pageSize: 30,
    current: 1
  });
  const id =
    (data &&
      (data.defaultVirtualOrg ||
        (data.leftVirtualOrg && data.leftVirtualOrg[0] && data.leftVirtualOrg[0].id))) ||
    null;
  externalVirtualOrgId = id;
  return id;
}

/**
 * 5. 人员快捷搜索
 * - internal（默认）：官方「选择人员」同接口 /api/hrm/common/browser/data/resource，
 *   cmd='all'，返回过滤 originTargetType === 'user'
 * - external：改走「外部组织维护」清单接口 /api/hrm/user/external/userExternalPage，
 *   能直接返回外部联系人的企业(subcompany) / 部门(department) / Job Title(position) / 联系方式
 * @param {string} keyword 搜索关键字
 * @param {{external?: boolean}} [opts]
 * @returns {Promise<Array>} 人员数组
 */
export async function searchPersons(keyword, opts = {}) {
  if (opts.external) {
    return searchExternalPersons(keyword);
  }
  const body = {
    browserMultiple: true,
    authWecahtBook: false,
    wxDepNeedConvertCount: 0,
    wxEmpNeedConvertCount: 0,
    wxTotalNeedConvertCount: 0,
    hideManager: '1',
    cmd: 'all',
    current: 1,
    pageSize: 50,
    formDatas: {
      username: [{ usernameOpt: 'in' }],
      status: [{ statusSelect: ['normal'] }],
      subcompany: [{ subcompanyOpt: 'in' }],
      department: [{ departmentOpt: 'in' }],
      role: [{ roleOpt: 'in' }],
      position: [{ positionOpt: 'in' }]
    },
    quickSearchDatas: {
      username: keyword,
      status: keyword,
      subcompany: keyword,
      department: keyword,
      role: keyword,
      position: keyword
    },
    type: 'and',
    containsNoneAccount: false,
    containsPartTimeEmployee: false
  };
  const data = await postJSON('/api/hrm/common/browser/data/resource', body);
  const items = (data && data.data) || [];
  return items.filter((it) => it.originTargetType === 'user');
}

/**
 * 外部联系人关键字搜索（「外部组织维护」清单接口）
 * 返回项已归一化为：{ id, name, subcompany(企业), department(部门), position, contact_way, mobile, email, external }
 * 其中 id 与加群接口同源，可直接作为 empIds 使用。
 */
export async function searchExternalPersons(keyword) {
  const virtualId = await ensureExternalVirtualOrgId();
  const data = await postJSON('/api/hrm/user/external/userExternalPage', {
    menuCode: 'externalOrgSetting',
    keyword: keyword || '',
    advCondition: {},
    virtualId,
    includeSub: true,
    containDisableDept: false
  });
  const items = (data && data.data) || [];
  return items.map((it) => ({
    id: it.id,
    name: it.username || it.name || '-',
    subcompany: it.subcompany || '',
    department: it.department || '',
    position: it.position || '',
    contact_way: it.contact_way || '',
    mobile: it.mobile || '',
    email: it.email || '',
    external: '1'
  }));
}
