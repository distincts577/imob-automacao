import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

const STAGES = [
  { key: 'LEAD', label: 'Lead' },
  { key: 'ATENDIMENTO', label: 'Atendimento' },
  { key: 'VISITA_APROVACAO', label: 'Visita / Aprovação' },
  { key: 'CLIENTE_APROVADO', label: 'Cliente aprovado' },
  { key: 'FECHAMENTO', label: 'Fechamento' },
];

export default function Messages() {
  const [stage, setStage] = useState('LEAD');
  const [templates, setTemplates] = useState([]);
  const [variables, setVariables] = useState([]);
  const [editing, setEditing] = useState(null); // template sendo editado
  const [preview, setPreview] = useState('');
  const textareaRef = useRef(null);

  useEffect(() => {
    api.get('/messages/variables').then(setVariables);
  }, []);

  useEffect(() => {
    load(stage);
  }, [stage]);

  async function load(s) {
    const data = await api.get(`/messages/${s}/templates`);
    setTemplates(data);
    setEditing(null);
  }

  useEffect(() => {
    if (!editing) return;
    const timeout = setTimeout(async () => {
      const { rendered } = await api.post('/messages/preview', { body: editing.body });
      setPreview(rendered);
    }, 250);
    return () => clearTimeout(timeout);
  }, [editing?.body]);

  function insertVariable(name) {
    const textarea = textareaRef.current;
    const insertion = `{{${name}}}`;
    if (!textarea) {
      setEditing({ ...editing, body: (editing.body || '') + insertion });
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newBody = editing.body.slice(0, start) + insertion + editing.body.slice(end);
    setEditing({ ...editing, body: newBody });
    setTimeout(() => textarea.focus(), 0);
  }

  async function saveTemplate() {
    if (editing.id) {
      await api.put(`/messages/templates/${editing.id}`, editing);
    } else {
      await api.post(`/messages/${stage}/templates`, { ...editing, order: templates.length + 1 });
    }
    load(stage);
  }

  async function removeTemplate(id) {
    await api.delete(`/messages/templates/${id}`);
    load(stage);
  }

  function newTemplate() {
    setEditing({ name: `Mensagem ${templates.length + 1}`, body: '', time: '09:00' });
    setPreview('');
  }

  return (
    <div>
      <div className="page-header"><h2>Mensagens</h2></div>

      <div className="tabs">
        {STAGES.map((s) => (
          <button key={s.key} className={stage === s.key ? 'active' : ''} onClick={() => setStage(s.key)}>
            {s.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr 320px', gap: 16 }}>
        <div className="card">
          <h4 style={{ marginTop: 0 }}>Mensagens configuradas</h4>
          {templates.map((t) => (
            <div
              key={t.id}
              onClick={() => { setEditing(t); }}
              style={{
                padding: 8,
                borderRadius: 8,
                cursor: 'pointer',
                marginBottom: 4,
                background: editing?.id === t.id ? '#eef0ff' : 'transparent',
              }}
            >
              <strong style={{ fontSize: 13 }}>{t.name}</strong>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.time}</div>
            </div>
          ))}
          <button className="btn btn-secondary" style={{ width: '100%', marginTop: 8 }} onClick={newTemplate}>
            + Nova mensagem
          </button>
        </div>

        <div className="card">
          {editing ? (
            <>
              <div className="field">
                <label>Nome</label>
                <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div className="field">
                <label>Horário</label>
                <input
                  type="time"
                  value={editing.time || ''}
                  onChange={(e) => setEditing({ ...editing, time: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Nome do template aprovado no WhatsApp (opcional)</label>
                <input
                  value={editing.templateName || ''}
                  onChange={(e) => setEditing({ ...editing, templateName: e.target.value })}
                  placeholder="ex.: primeiro_contato_lead"
                />
              </div>
              <div className="field">
                <label>Mensagem</label>
                <div style={{ marginBottom: 6 }}>
                  {variables.map((v) => (
                    <span key={v} className="var-chip" onClick={() => insertVariable(v)}>
                      + {`{{${v}}}`}
                    </span>
                  ))}
                </div>
                <textarea
                  ref={textareaRef}
                  rows={8}
                  value={editing.body}
                  onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={saveTemplate}>Salvar mensagem</button>
                {editing.id && (
                  <button className="btn btn-danger" onClick={() => removeTemplate(editing.id)}>Excluir</button>
                )}
              </div>
            </>
          ) : (
            <p style={{ color: 'var(--text-muted)' }}>Selecione ou crie uma mensagem para editar.</p>
          )}
        </div>

        <div className="card">
          <h4 style={{ marginTop: 0 }}>Visualizar exemplo</h4>
          <div className="whatsapp-preview">
            {editing && (
              <div className="whatsapp-bubble">
                {preview || editing.body}
                <span className="time">{editing.time || '--:--'} ✓✓</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
