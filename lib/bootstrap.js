/**
 * 注入到 index.html 的引导脚本（内容必须保持稳定）。
 *
 * 桌面壳的注入表是**宿主启动时的一次性快照**，所以注入文本里不能带任何"会变"的东西：
 * 这里只放配置快照 + 两个动态加载的标签（样式 / 运行时），真正的代码从路由现取。
 * 结果是——改 runtime.js / runtime.css 只要刷新页面就生效，不必重启 DSH。
 */
export function bootstrapScript(base, config) {
  const json = JSON.stringify(config).replace(/</g, '\\u003c')
  return `(function(){try{
window.__WPS_CFG__=${json};
var base=${JSON.stringify(base)};
var head=document.head||document.documentElement;
var v=Date.now();
if(!document.getElementById('wps-style')){
  var l=document.createElement('link');
  l.id='wps-style';l.rel='stylesheet';l.href=base+'/runtime.css?v='+v;
  head.appendChild(l);
}
if(!document.getElementById('wps-runtime')){
  var s=document.createElement('script');
  s.id='wps-runtime';s.src=base+'/runtime.js?v='+v;s.async=false;
  head.appendChild(s);
}
}catch(e){}})();`
}
