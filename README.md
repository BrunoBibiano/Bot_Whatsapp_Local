# WhatsApp Local · Campanhas & Dashboard

## Distribuir para clientes

Os arquivos prontos ficam em **release/**. Envie `WhatsApp-Local-1.0.0-Setup.exe` ao cliente. Ele executa o instalador, aguarda e usa o atalho **WhatsApp Local** na Área de Trabalho. Na primeira abertura, escaneia o QR com a conta dele.

Alternativa: envie `WhatsApp-Local-1.0.0-Windows-x64.zip`. O cliente deve extrair **todos** os arquivos e abrir **Instalar WhatsApp.vbs**. O ZIP e o EXE contêm o mesmo aplicativo.

O pacote é para **Windows 10/11 x64**, inclui Node.js e dependências de produção e não exige Node, npm, Git, VS Code ou terminal no computador do cliente. Precisa de internet para conectar ao WhatsApp. A instalação é por usuário em `%LOCALAPPDATA%\Programs\WhatsAppLocal`, sem elevação administrativa. Os atalhos de reiniciar e encerrar ficam também no menu Iniciar.

O instalador não é assinado digitalmente. `release/SHA256SUMS.txt` permite conferir integridade dos arquivos; não substitui uma assinatura digital.

Para gerar outra distribuição após alterações:

```powershell
npm.cmd run dist:client
```

O gerador compila a interface, instala dependências em uma pasta isolada, baixa o Node.js oficial e verifica o SHA-256 publicado pelo Node.js. Usa lista de arquivos permitidos e **não copia auth, banco de dados, logs, .env ou atalhos antigos**. Verifica também o conteúdo do instalador EXE. Caches e arquivos temporários ficam em `.distribution/` e nunca devem ser enviados aos clientes. Distribua apenas os arquivos finais de `release/`.

Cada instalação cria sua própria sessão e banco. Atualizações pelo instalador preservam `auth`, `data` e `.runtime`; campanhas ativas exigem confirmação antes de interromper. Para cópias de segurança, use os recursos do próprio aplicativo. Não use a pasta de uma instalação ativa como pacote para outro cliente.

O teste de distribuição (`scripts/Test-ClientPackage.ps1`) instala em uma pasta isolada, verifica a abertura sem Node no PATH e testa a preservação de dados fictícios em uma reinstalação. Ele não envia mensagens reais nem cria atalhos no Desktop do desenvolvedor.

Aplicativo local com Node.js, Express, Socket.io e Baileys. Interface React, Tailwind CSS e Lucide, com cinco temas e personalização ao vivo. Servido pelo próprio aplicativo em **http://localhost:3010**, sem outro servidor de interface.

## Abrir no Windows

Dê dois cliques no atalho **WhatsApp** ou em **Iniciar WhatsApp.vbs**. O servidor fica em segundo plano e o navegador abre automaticamente. Para carregar atualizações, use **Reiniciar WhatsApp.vbs**. Fechar o navegador não encerra o servidor.

O iniciador reutiliza uma instância desta pasta ou escolhe uma porta livre entre 3010 e 3020. Registros técnicos ficam em `.runtime`. Uma trava impede duas instâncias da mesma pasta, inclusive por terminal. Cópias da sessão em outras pastas/computadores também podem causar conflito 440.

## Instalação inicial para o responsável técnico

Requer **Node.js 22.13+** (recomendado: Node.js 24), npm, internet e eventualmente Git para dependências. Não usa Puppeteer ou navegador automatizado.

```powershell
git clone https://github.com/BrunoBibiano/Bot_Whatsapp_Local.git
cd Bot_Whatsapp_Local
npm.cmd install
npm.cmd run build
npm.cmd start
```

A compilação gera `public/index.html` e os assets da interface. `npm.cmd start` serve o aplicativo na porta 3010. Não é necessário compilar a cada abertura. Para desenvolvimento opcional, `npm.cmd run dev:ui` usa Vite com proxy para o servidor principal na 3010.

## Telas

- **Dashboard:** envios aceitos, tempo médio, campanhas, entregas confirmadas, média mensal de tempo e volume por mês/ano. Dados reais do banco; sem registros, gráficos vazios. A média por envio considera consulta, envio e arquivamento dos contatos aceitos, sem os intervalos. Gráficos usam horário de Brasília.
- **Novo disparo:** nome, CSV/TXT, mensagem com variáveis, imagem/Drive, intervalos, prévia do primeiro contato, estimativas e logs.
- A prévia imita a conversa do WhatsApp com nome/número do primeiro contato, balão, quebras de linha, horário e imagem com legenda. Reconhece visualmente `*negrito*`, `_itálico_`, `~riscado~` e texto entre crases; a renderização é aproximada. O conteúdo é tratado como texto, não HTML. A imagem é carregada automaticamente após uma breve pausa na digitação pelo servidor local, inclusive para links do Drive, sem enviar mensagem. O horário e os ícones de confirmação são ilustrativos e não indicam entrega ou leitura.
- **Histórico & Banco local:** busca por nome, filtro de status, paginação, detalhes por contato, CSV, exportação JSON e exclusão confirmada.
- **Aparência & Temas:** cinco presets, editor de cores/HEX, prévia e restauração. Tokens CSS e persistência no localStorage.

## Conectar e enviar

1. No celular: **WhatsApp → Aparelhos conectados → Conectar um aparelho**. Escaneie o QR da interface. A sessão fica em `auth/`.
2. Em **Novo disparo**, cole ou importe UTF-8, sem cabeçalho:

   ```text
   5511999999999;João;Plano Pro;R$ 99
   5521988888888;Maria;Plano Básico;R$ 49
   ```

3. Escreva `Olá, {{nome}}! Seu {{var2}} custa {{var3}}.`. `{{nome}}` equivale a `{{var1}}`. Variáveis ausentes ficam vazias. Aspas duplas permitem ponto e vírgula dentro de um campo. Números brasileiros de 10/11 dígitos recebem DDI 55 quando faltar; DDD obrigatório.
4. Opcionalmente cole um link direto de JPG/PNG/WebP ou arquivo Google Drive. No Drive, habilite **Qualquer pessoa com o link** e download. A imagem, de até 10 MB, é baixada/validada uma vez antes dos envios; se falhar, a campanha termina com erro sem começar a enviar. A mensagem vira legenda.
5. Configure intervalos de 1 a 3.600 segundos. A previsão inicial soma pausas; durante a fila, ajusta-se ao processamento real. Mil contatos, de 5 a 10 segundos, têm cerca de **2h05min em pausas**, mais consultas e envios.
6. Clique em **Iniciar disparos**. Campanha e contatos são registrados no banco antes do processamento. `onWhatsApp()` verifica cada número válido antes de enviar.
7. **Parar disparos** interrompe a espera e impede próximos contatos; uma mensagem em trânsito pode concluir. Restantes ficam como não enviados. Queda de conexão cancela a fila. Campanhas não são retomadas automaticamente.

“Aceito” significa que a chamada de envio retornou com sucesso, sem garantir entrega/leitura/descriptografia. Entrega/leitura só mudam quando há recibos. Na tela de detalhes, use **Atualizar** para buscar resultados novos. Envie apenas para quem autorizou. Intervalos não garantem evitar bloqueios; Baileys é uma integração não oficial.

## Banco e arquivos

```text
Whatsapp/
├── server.js                 # API, fila e conexão
├── database.js               # SQLite e relatórios
├── frontend/                 # código React e estilos
├── public/                   # interface compilada servida pelo Express
├── shared/estimate.js        # previsão compartilhada
├── data/whatsapp.sqlite      # histórico criado automaticamente
├── auth/                     # credenciais e recuperação de mensagens
├── scripts/                  # início, reinício e diagnóstico
└── test/                     # testes
```

SQLite guarda contatos, nomes, modelos de mensagem, URLs de mídia, resultados, tempos e IDs. Não exige outro serviço de banco. Logs persistidos são limitados a dez mil registros; os últimos 500 aparecem na interface. **Limpar tela** limpa somente a exibição, não os logs do banco.

O histórico começa nas campanhas iniciadas após esta atualização; envios antigos não são reconstruídos como confirmações. Campanhas em curso no encerramento são marcadas como interrompidas ao reiniciar. Limpar sessão não apaga histórico.

CSV exporta resultados de uma campanha. JSON exporta os registros do banco, sem importação automática. Excluir uma campanha remove resultados e altera totais dos gráficos; não apaga mensagens no WhatsApp. Para cópia manual, encerre o aplicativo e copie todos os arquivos `whatsapp.sqlite*` juntos. Veja [data/README.md](data/README.md).

`auth/sent-messages.json` preserva as últimas 2.000 mensagens para pedidos de recuperação após reinício. IDs permitem correlacionar pedidos e envios. Mensagens antigas ou de outros aparelhos podem não estar disponíveis. Mantenha o servidor ligado após enviar. Não compartilhe `data`, `auth` ou exportações, pois contêm dados dos contatos/mensagens.

## Diagnóstico e testes

```powershell
npm.cmd test
npm.cmd run check
npm.cmd run build
node scripts/diagnose-whatsapp.js
```

Diagnóstico usa credenciais temporárias em memória, sem alterar a sessão salva. O protocolo é consultado como dados no repositório oficial com timeout/fallback. `WA_VERSION` permite override no formato `2,3000,1234567890`; use apenas valores atuais confirmados.

Testes usam SQLite temporário e DOM/conexão simulados, sem mensagens reais. Pareamento, recibos e envios reais exigem conta e contatos autorizados. A verificação visual automatizada pode estar indisponível neste ambiente.
