/**
 * e-code 页面读取 e-builder「跳转链接 - 隐式传参」的工具函数
 *
 * 机制说明：
 * - e-builder 按钮配置「打开页面」+「隐式传参」时，参数不拼在 URL 上，
 *   而是写入 sessionStorage.jumplinkParams，key 为目标链接地址；
 *   URL 上只带 ?jumplinkParamKey=<目标链接地址 URL 编码>。
 * - e-builder 目标页面会自动消费；e-code 页面（/sp/custom/...）不会自动消费，
 *   需调用本工具手动读取。
 *
 * 用法：
 *   import { getImplicitLinkParams } from './utils/implicitParams';
 *   const params = getImplicitLinkParams();
 *   // params.groupIds === '1001,1002' // (example)
 */

/**
 * 读取当前页面 URL 上 jumplinkParamKey 对应的隐式传参
 * @returns {object} 参数对象；无参数或解析失败时返回 {}
 */
export function getImplicitLinkParams() {
  const key = new URLSearchParams(window.location.search).get('jumplinkParamKey');
  if (!key) return {};
  try {
    const all = JSON.parse(sessionStorage.getItem('jumplinkParams') || '{}');
    const params = all[key] || all[decodeURIComponent(key)] || {};
    // 平台写入时会对 key/value 做 encodeURIComponent，统一解码
    const result = {};
    Object.keys(params).forEach((k) => {
      result[decodeURIComponent(k)] = decodeURIComponent(params[k]);
    });
    return result;
  } catch (e) {
    return {};
  }
}

/**
 * 读取指定 key 的隐式参数值
 * @param {string} name 参数名
 * @param {*} defaultVal 默认值
 */
export function getImplicitLinkParam(name, defaultVal) {
  const params = getImplicitLinkParams();
  return params[name] !== undefined ? params[name] : defaultVal;
}

export default getImplicitLinkParams;
