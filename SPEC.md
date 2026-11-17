# Especificação

## Distribuição Windows para clientes
Pacote para Windows x64 com Node.js oficial e dependências de produção incluídos. Gerador por allowlist, sem auth, SQLite pessoal, logs, .env ou links absolutos do desenvolvedor. Artefatos ZIP e EXE com hashes SHA-256; EXE verificado pela extração e comparação do conteúdo CAB. Instalação por usuário sem Node global, com atalhos e abertura automática. Atualização preserva banco/sessão e verifica fila ativa antes de encerrar. Testes em pasta isolada, sem navegador, mensagens reais ou escrita no Desktop do usuário.

## Interface e banco local
Prévia de conversa estilo WhatsApp: balão, contato personalizado, imagem/legenda, quebras e formatação básica, com semântica de prévia sem confirmação de envio. Download de imagem usa a validação existente, timeout e limite de 10 MB; requisições canceladas deixam de baixar. URLs temporárias no navegador são revogadas ao trocar mídia ou sair da tela. Testes não enviam mensagens e verificam que texto HTML permanece inerte.
Aplicar a identidade visual ao aplicativo WhatsApp existente em localhost:3010. React/Tailwind/Lucide compilados em public, sem segundo projeto ou publicação externa. Quatro telas: Dashboard, Novo disparo, Histórico & Banco local e Aparência & Temas.

SQLite em data/whatsapp.sqlite registra campanhas e resultados individuais. Dashboard usa registros reais: tempo médio dos envios aceitos exclui pausas; volume mensal/anual usa horário de Brasília. Recibos distinguem aceitação, entrega e leitura. Não inventar histórico anterior.

Gerenciamento: busca, filtro, paginação, detalhes, CSV, relatório JSON e exclusão explícita de campanhas encerradas. Limpar credenciais não apaga banco. Inicialização detecta campanhas interrompidas e não retoma envios. Testes usam SQLite temporário e DOM simulado, sem mensagens reais. Temas ficam no navegador; campanhas ficam no banco.

## Problema e solução
Enviar mensagens personalizadas para uma lista de contatos brasileiros usando uma sessão local do WhatsApp e acompanhar os resultados no navegador.

## Fluxo mapeado
Contatos e intervalos → /api/estimate → mesma leitura CSV da fila → (quantidade − 1) pausas → média/faixa. Durante a fila: tempo de processamento por contato + intervalos futuros + pausa atual restante → previsão atualizada no navegador. Sem garantia de prazo ou confirmação de entrega.
Atalho Windows → VBS → iniciador PowerShell oculto → verifica Node/dependências → reutiliza instância ou seleciona porta livre → inicia Node oculto → aguarda /api/health → navegador.
Interface → POST /api/start → validação CSV/configuração → fila única → normalização → onWhatsApp → substituição de variáveis → sendMessage → eventos Socket.io → interface.
Conexão → useMultiFileAuthState → connection.update → QRCode DataURL / status → Socket.io.
Parada → AbortController → interrupção do intervalo e bloqueio do próximo envio.
Graphify não estava instalado nem exposto como ferramenta nesta sessão; este é um mapeamento textual, não um resultado do Graphify.

## Requisitos e decisões
- Uma sessão e uma fila por servidor; interface restrita a loopback.
- Trava do próprio processo precede o acesso às credenciais e impede duas instâncias na mesma pasta. Erro 440 suspende reconexão automática. Health identifica a pasta por hash; iniciador reutiliza instâncias da mesma pasta e oferece reinício sem apagar sessão.
- CSV sem cabeçalho, delimitado por ponto e vírgula; aspas e campos ausentes suportados.
- DDD obrigatório; números brasileiros de 10/11 dígitos recebem prefixo 55. Não inferir números estrangeiros.
- Primeira coluna após o número equivale a var1 e nome.
- Intervalos de 1 a 3.600 segundos, aplicados entre contatos, sem intervalo final.
- Parar interrompe a espera imediatamente. Operações já em trânsito podem concluir; uma nova fila aguarda a anterior terminar.
- Queda de conexão cancela a fila e não a retoma automaticamente.
- Protocolo consultado como dados no arquivo Defaults oficial, com timeout e fallback para o pacote; override via WA_VERSION. Quedas exibem código/motivo e usam espera progressiva até 30 segundos.
- Limpar sessão remove as credenciais locais e inicia novo pareamento.
- Logs em memória limitados a 500 registros; sessão em disco ignorada pelo Git.
- Arquivo local das últimas 2.000 mensagens enviadas preserva recuperação após reinício; codificação protobuf conserva campos binários de mídia. Envio e pedidos de recuperação registram IDs para correlação; limpar sessão apaga o arquivo.
- Sucesso significa aceitação pelo envio da biblioteca; não confirma leitura ou entrega ao destinatário.

## Validação
Testes de comportamento da entrada CSV, normalização, personalização e rejeição de configuração inválida. Verificação de sintaxe e inicialização HTTP. Pareamento, existência de número, envio real e mídia exigem conta e teste manual no WhatsApp.

## Fora de escopo
Grupos, agendamento, múltiplas contas, persistência da fila, confirmação de leitura e exposição pública do servidor.

## Referência de engenharia
Estrutura inspirada em mattpocock/skills/to-spec. Não se executou o fluxo completo de publicação em issue tracker, pois a tarefa é uma entrega local e nenhum tracker foi configurado.
