import React, { useEffect, useId, useState } from 'react';
import { ArrowLeft, CheckCheck, Image as ImageIcon, Loader2, MessageCircle, MoreVertical, Phone, UserRound, Video } from 'lucide-react';
import './preview.css';

// Formatação visual comum do WhatsApp, sem interpretar HTML da mensagem.
export function MessageText({ text, depth = 0 }) {
  if (depth > 4) return text;
  const pattern = /```([\s\S]+?)```|`([^`\n]+)`|\*([^*\n]+)\*|_([^_\n]+)_|~([^~\n]+)~|(https?:\/\/[^\s<>]+)/g;
  const pieces = [];
  let start = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > start) pieces.push(text.slice(start, match.index));
    const content = match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5];
    const child = <MessageText text={content || ''} depth={depth + 1} />;
    const key = match.index;
    if (match[1] || match[2]) pieces.push(<code key={key}>{content}</code>);
    else if (match[3]) pieces.push(<strong key={key}>{child}</strong>);
    else if (match[4]) pieces.push(<em key={key}>{child}</em>);
    else if (match[5]) pieces.push(<s key={key}>{child}</s>);
    else pieces.push(<a key={key} href={match[6]} target="_blank" rel="noopener noreferrer">{match[6]}</a>);
    start = match.index + match[0].length;
  }
  if (start < text.length) pieces.push(text.slice(start));
  return pieces;
}

function ChatWallpaper() {
  const id = useId().replaceAll(':', '');
  return <svg className="wa-wallpaper" aria-hidden="true"><defs><pattern id={id} width="220" height="180" patternUnits="userSpaceOnUse"><g fill="none" stroke="var(--wa-pattern)" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"><path d="M24 26l28 9-22 11 4-16 18 5M112 28c-10-13-24 4 0 18 24-14 10-31 0-18ZM176 17l3 8 9 1-7 6 2 9-7-5-8 5 3-9-7-6 9-1Z M54 95h24a8 8 0 0 1 8 8v12a8 8 0 0 1-8 8H66l-10 8v-8h-2a8 8 0 0 1-8-8v-12a8 8 0 0 1 8-8Z M57 106h18m-18 8h12M142 97l9-4 5 8-7 6c5 8 9 12 17 16l6-7 8 5-4 9c-2 8-19 1-28-8-10-10-16-24-6-25ZM12 154l4-4m4 4-4 4m-4-4 4 4m4-4-4-4M102 153l4-7 4 7 8 2-6 5 1 8-7-4-7 4 1-8-6-5ZM197 143l6 5-3 8-9-1-1-8Z"/></g></pattern></defs><rect width="100%" height="100%" fill={`url(#${id})`}/></svg>;
}

export default function MessagePreview({ text, sample, imageUrl }) {
  const [media, setMedia] = useState({ url: '', loading: false, error: '' });
  const source = imageUrl.trim();
  useEffect(() => {
    if (!source) { setMedia({ url: '', loading: false, error: '' }); return; }
    const controller = new AbortController();
    let objectUrl;
    setMedia({ url: '', loading: true, error: '' });
    const timer = setTimeout(async () => {
      try {
        const response = await fetch('/api/media/preview', {
          method: 'POST', signal: controller.signal,
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: source }),
        });
        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.error || 'Não foi possível carregar a imagem.');
        }
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setMedia({ url: objectUrl, loading: false, error: '' });
      } catch (error) {
        if (!controller.signal.aborted) setMedia({ url: '', loading: false, error: error.message });
      }
    }, 700);
    return () => { clearTimeout(timer); controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [source]);

  const name = sample?.vars?.[0]?.trim() || (sample ? 'Contato sem nome' : 'Seu contato');
  const initials = name.split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join('').toUpperCase();
  const number = sample?.number?.replace(/^55(\d{2})(\d{4,5})(\d{4})$/, '+55 ($1) $2-$3');
  const hasText = !!text.trim();
  const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return <section className="card whatsapp-preview-card" aria-label="Prévia da mensagem no estilo WhatsApp">
    <div className="section-head"><div><h2>Uma prévia da sua mensagem</h2><p>Veja como o texto e a imagem ficam na conversa.</p></div><span className="outline-badge">{sample ? 'Primeiro contato' : 'Prévia ao vivo'}</span></div>
    <div className="wa-chat">
      <div className="wa-chat-header"><ArrowLeft size={18} aria-hidden="true"/><div className="wa-chat-avatar" aria-hidden="true">{sample ? initials : <UserRound size={21}/>}</div><div className="wa-chat-person"><strong>{name}</strong><small>{number || 'Prévia da conversa'}</small></div><div className="wa-chat-tools" aria-hidden="true"><Video size={19}/><Phone size={16}/><MoreVertical size={18}/></div></div>
      <div className="wa-chat-body"><ChatWallpaper/><div className="wa-date-pill">Hoje</div><div className={`wa-bubble ${source ? 'wa-bubble-media' : ''} ${!hasText && !source ? 'wa-bubble-placeholder' : ''}`}>
        {source && <div className="wa-media">{media.url ? <img src={media.url} alt="Imagem que será enviada com a mensagem" onError={() => setMedia(current => ({ ...current, url: '', error: 'O navegador não conseguiu exibir esta imagem.' }))}/> : <div className="wa-media-placeholder">{media.loading ? <Loader2 size={30} className="spin"/> : <ImageIcon size={32}/>}<span>{media.loading ? 'Carregando sua imagem…' : 'Não foi possível exibir a imagem'}</span></div>}</div>}
        <div className="wa-bubble-content">{hasText ? <div className="wa-message-text"><MessageText text={text}/></div> : !source && <div className="wa-message-placeholder"><MessageCircle size={20}/><span>Sua mensagem aparecerá aqui enquanto você escreve.</span></div>}<div className="wa-message-meta"><time>{time}</time><CheckCheck size={16} aria-hidden="true"/></div></div>
      </div><div className="wa-chat-preview-label">Prévia local · nenhuma mensagem enviada</div></div>
    </div>
    {media.error && source && <p className="wa-preview-error" role="status">{media.error}</p>}
    <p className="wa-preview-hint">{sample ? '{{nome}} equivale a {{var1}}. Variáveis ausentes ficam vazias.' : 'Adicione contatos para visualizar a substituição das variáveis.'} Horário e ícones são ilustrativos, sem confirmar envio ou leitura.</p>
  </section>;
}
