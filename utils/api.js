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

/**
 * 5. 人员快捷搜索（按姓名/拼音/账号/邮箱/手机号等匹配）
 * @param {string} keyword 搜索关键字
 * @returns {Promise<Array>} 人员数组（originTargetType === 'user' 的条目）
 */
export async function searchPersons(keyword) {
  const data = await postJSON('/api/hrm/common/browser/data/resource', {
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
  });
  const items = (data && data.data) || [];
  return items.filter((it) => it.originTargetType === 'user');
}
