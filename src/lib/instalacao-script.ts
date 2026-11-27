/**
 * Script colocado no <head> do site inteiro (roda antes do React): guarda o
 * evento de instalação do navegador para o botão "Baixar o app" usar depois.
 * Fica fora de lib/instalacao.ts porque aquele arquivo é de cliente.
 */
export const SCRIPT_CAPTURA_INSTALACAO = `
window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__eventoInstalar=e;window.dispatchEvent(new Event("instalacao-mudou"));});
window.addEventListener("appinstalled",function(){window.__eventoInstalar=null;try{localStorage.setItem("app-instalado","1")}catch(_){}window.dispatchEvent(new Event("instalacao-mudou"));});
`;
