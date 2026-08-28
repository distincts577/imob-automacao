/**
 * Renderização de variáveis nas mensagens — seção 5.
 * Lista de variáveis suportadas, igual à especificada no escopo.
 */

const AVAILABLE_VARIABLES = [
  'nome',
  'primeiro_nome',
  'telefone',
  'email',
  'imovel',
  'codigo_imovel',
  'endereco_imovel',
  'cidade',
  'bairro',
  'valor_imovel',
  'corretor',
  'nome_corretor',
  'empresa',
  'data_visita',
  'horario_visita',
  'etapa',
  'data_ultimo_contato',
  'link_imovel',
  'link_atendimento',
];

const STAGE_LABELS = {
  LEAD: 'Lead',
  ATENDIMENTO: 'Atendimento',
  VISITA_APROVACAO: 'Visita / Aprovação',
  CLIENTE_APROVADO: 'Cliente aprovado',
  FECHAMENTO: 'Fechamento',
  PERDIDO: 'Perdido',
};

function formatCurrency(value) {
  if (value == null) return '';
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(date) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('pt-BR');
}

function formatTime(date) {
  if (!date) return '';
  return new Date(date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Monta o dicionário de valores de variáveis a partir do cliente, negócio,
 * imóvel e corretor associados, e da empresa (settings gerais).
 */
function buildVariableContext({ client, deal, property, broker, company }) {
  return {
    nome: client?.name ?? '',
    primeiro_nome: client?.name ? client.name.split(' ')[0] : '',
    telefone: client?.phone ?? '',
    email: client?.email ?? '',
    imovel: property?.title ?? '',
    codigo_imovel: property?.code ?? '',
    endereco_imovel: property?.address ?? '',
    cidade: property?.city ?? '',
    bairro: property?.neighborhood ?? '',
    valor_imovel: formatCurrency(property?.price),
    corretor: broker?.name ?? '',
    nome_corretor: broker?.name ?? '',
    empresa: company?.companyName ?? '',
    data_visita: formatDate(deal?.visitDate),
    horario_visita: formatTime(deal?.visitDate),
    etapa: STAGE_LABELS[client?.currentStage] ?? '',
    data_ultimo_contato: formatDate(client?.lastInteractionAt),
    link_imovel: property?.link ?? '',
    link_atendimento: deal?.id ? `${process.env.APP_URL || ''}/atendimento/${deal.id}` : '',
  };
}

/** Substitui {{variavel}} pelo valor correspondente. Deixa como está se não encontrar. */
function renderTemplate(templateBody, context) {
  return templateBody.replace(/{{\s*([a-z_]+)\s*}}/gi, (match, key) => {
    return Object.prototype.hasOwnProperty.call(context, key) ? context[key] : match;
  });
}

module.exports = {
  AVAILABLE_VARIABLES,
  buildVariableContext,
  renderTemplate,
};
