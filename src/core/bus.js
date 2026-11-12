// Bus d'événements partagé (scène 3D, lecteur audio, interface).
// Événements :
//   'player:state'   detail { playing:boolean, trackId:string|null, time:number, duration:number }
//   'player:select'  detail { trackId:string }                 (demande de chargement)
//   'scroll:progress' detail { p:number 0..1, section:'ouverture'|'sons'|'dates'|'avec'|'bio'|'contact' }
//   'scene:ready'    detail {}
export const bus = new EventTarget();
export const emit = (type, detail = {}) => bus.dispatchEvent(new CustomEvent(type, { detail }));
export const on = (type, fn) => {
  const h = (e) => fn(e.detail);
  bus.addEventListener(type, h);
  return () => bus.removeEventListener(type, h);
};
