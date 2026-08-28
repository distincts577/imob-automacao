// Todas as datas do sistema (data prevista da fila, histórico, logs etc.)
// devem ser exibidas no horário de Palhoça/SC, que segue o fuso
// America/Sao_Paulo (Horário de Brasília) — independentemente do fuso
// horário configurado no computador/navegador de quem está olhando a tela.
//
// Antes, as telas usavam `new Date(valor).toLocaleString('pt-BR')` sem
// especificar o fuso. O JS então usa o fuso LOCAL DO NAVEGADOR para formatar
// a exibição. Se a pessoa acessando o painel estivesse com o computador/
// celular configurado em outro fuso (ou o navegador detectasse errado),
// a hora mostrada na tela ficava diferente da hora real de Palhoça.
//
// Usando timeZone: 'America/Sao_Paulo' aqui, o horário exibido é sempre o
// de Palhoça/SC, não importa onde ou em qual fuso a tela é acessada.

const TIMEZONE = 'America/Sao_Paulo';

export function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR', { timeZone: TIMEZONE });
}

export function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('pt-BR', { timeZone: TIMEZONE });
}

export function formatTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('pt-BR', { timeZone: TIMEZONE });
}
