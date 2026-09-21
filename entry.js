/**
 * 前端入口文件
 * 用于注册新页面路由：/sp/custom/group-member-manager/members
 *
 * 群组成员管理页面：
 * - 通过 e-builder「打开页面-隐式传参」接收 groupIds（群组ID，逗号分隔），
 *   只展示参数指定的公共群组及其成员，支持直接添加/移出成员。
 * - 无参数时不加载任何数据，展示空态提示。
 */

import { asyncImport } from '@weapp/ecodesdk';
import { regOvProps, regReactChildren, appInfo } from '@weapp/utils';
import { Route } from 'react-router-dom';

// 获取应用公共路径
const { publicUrl } = appInfo('@weapp/ecodesdk');

/**
 * 异步加载页面组件
 * 重要：'${appId}' 是 E10 平台的运行时占位符，平台会自动替换为实际 appId
 */
const PageComponent = React.lazy(() => {
  return asyncImport('${appId}', 'index.js');
});

/**
 * 创建路由元素
 * 路由格式: /sp/custom/{模块名}/{页面名}
 */
const PageRoute = (
  <Route path={`${publicUrl}/sp/custom/group-member-manager/members`}>
    <React.Suspense fallback={<div>页面加载中...</div>}>
      <PageComponent />
    </React.Suspense>
  </Route>
);

/**
 * 注册路由到 Switch 组件
 */
let registered = false;
regOvProps('weappEcodesdk', 'Switch', (props) => {
  if (!registered) {
    regReactChildren(props, PageRoute);
    registered = true;
    console.info('[group-member-manager] 路由已注册');
  }
  return props;
}, 0);
