# Banco de dados local

O aplicativo cria `whatsapp.sqlite` automaticamente nesta pasta. Não é necessário instalar um servidor de banco de dados.

O SQLite guarda campanhas, modelo da mensagem, URL de mídia, nome/número dos contatos, resultados, tempos e IDs de mensagem. Credenciais do WhatsApp continuam na pasta `auth`, separadas do histórico. Não compartilhe estas pastas com terceiros.

Use **Histórico & Banco local** na interface para consultar campanhas, exportar relatórios CSV, baixar uma cópia JSON dos registros e excluir uma campanha com confirmação. Limpar a sessão do WhatsApp não apaga o histórico.

Interrupções do servidor marcam campanhas em andamento como interrompidas na próxima inicialização. O aplicativo não retoma disparos automaticamente. Resultados anteriores à instalação do banco não podem ser reconstruídos com segurança e não são importados como envios confirmados.

Para copiar manualmente os arquivos do banco, encerre o aplicativo antes e copie todos os arquivos `whatsapp.sqlite*` juntos. A cópia JSON é um relatório portátil, não possui importação automática.
