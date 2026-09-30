# GWL NEXO 2.0 — Hostinger e GitHub

Portal GWL NEXO com GWL Flow, Ponto DIMIVIG e GWL Planner, preparado para executar em Node.js 24 com MySQL/MariaDB.

Esta versão inclui a coluna **Folha de Ponto** nos contratos do GWL Flow e **Gustavo** como responsável disponível nessa área.

## Publicar na Hostinger

1. No hPanel, abra **Sites → Adicionar site → Aplicação Node.js / Deploy Web App → Importar repositório GitHub**.
2. Selecione `dimivigia-dev/gwl-nexo`, branch `main`.
3. Configure os valores abaixo. O servidor e os arquivos compilados já estão neste repositório.

| Configuração | Valor |
| --- | --- |
| Framework/tipo | `Other` / `Outros` |
| Versão Node.js | `24.x` |
| Diretório do projeto | Raiz do repositório (`.`) |
| Comando de build | `npm run build` |
| Arquivo de entrada | `server.cjs` |
| Comando de início, se solicitado | `npm start` |
| Diretório de saída, se solicitado | Raiz (`.`), contendo `server.cjs`, `server.mjs` e `public/` |

4. Crie um banco MySQL/MariaDB e seu usuário. No phpMyAdmin desse banco, importe [banco_sql/GWL_NEXO_HOSTINGER_V2.sql](banco_sql/GWL_NEXO_HOSTINGER_V2.sql). Esse arquivo tem nome diferente para identificar a nova tentativa; cria as tabelas referenciadas antes das dependentes. O arquivo `GWL_NEXO_estrutura.sql` contém o mesmo esquema.
5. Cadastre as variáveis da aplicação indicadas abaixo antes de iniciar o servidor.
6. Publique e abra `https://SEU-DOMINIO/instalar`. Informe o código `INSTALL_TOKEN` configurado, o nome do administrador e uma senha de 10 a 128 caracteres. Essa ativação ocorre uma única vez.
7. Entre com o `OWNER_EMAIL` e a senha criada. Essa conta administra Flow, Ponto DIMIVIG e Planner.

### Variáveis da aplicação

Use [.env.example](.env.example) como referência para os nomes. Preencha os valores no painel da Hostinger.

| Variável | Valor a preencher |
| --- | --- |
| `APP_URL` | URL HTTPS completa do site, sem barra final |
| `DB_HOST` | `localhost` quando o banco está na mesma hospedagem Hostinger |
| `DB_PORT` | Porta do banco, normalmente `3306` |
| `DB_NAME` | Nome completo do banco criado |
| `DB_USER` | Usuário do banco |
| `DB_PASSWORD` | Senha desse usuário |
| `DB_SSL` | `false` para conexão local; `true` quando o banco exigir TLS |
| `OWNER_EMAIL` | E-mail do administrador; padrão `dimivigia@gmail.com` |
| `INSTALL_TOKEN` | Código aleatório de pelo menos 32 caracteres |

O cadastro público do Planner também usa `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` e `SMTP_FROM` para confirmar e-mails. Sem SMTP configurado, o administrador ainda pode cadastrar usuários.

As senhas reais pertencem às variáveis da hospedagem. O repositório contém somente o modelo `.env.example`.

## Banco e registros existentes

O SQL cria a estrutura para uma **instalação nova**. Os registros, logins e anexos atualmente armazenados no ambiente Sites precisam de uma exportação específica para serem transferidos. Novos registros e anexos desta instalação ficam no banco MySQL configurado; mantenha backup desse banco.

## Atualizações pelo GitHub

A Hostinger pode publicar automaticamente os commits enviados à branch selecionada quando essa opção estiver ativa no painel.

O arquivo de entrada é `server.cjs`, que inicia o servidor compilado em `server.mjs`. Funciona tanto pelo comando `npm start` quanto quando a hospedagem carrega o arquivo de entrada através de outro processo. As interfaces estão em `public/`; o código-fonte está em `source/` e `runtime/`. O comando `npm run build` valida os arquivos já compilados, permitindo publicar esta versão sem recompilação.

Depois de editar o código-fonte, recompile antes de enviar o commit:

```sh
npm ci --include=dev
npm run rebuild
npm run build
```

Inclua no commit o código alterado, `server.mjs` e as mudanças em `public/`. Alterações realizadas em outro ambiente precisam ser enviadas a este repositório para chegar à Hostinger. Quando alterar dependências, atualize também `package-lock.json`.

## Erros na instalação

Se aparecer a página genérica **503 Service Unavailable**, confira o arquivo de entrada `server.cjs`, Node.js 24, framework **Other** e diretório de saída `.`. Salve e faça uma nova implantação. Se o erro continuar, consulte **Runtime logs / Logs de execução** no painel Node.js; a tela 503 sozinha não informa a causa.

A página `/instalar` informa variáveis ausentes, acesso ao banco recusado, banco não encontrado, falha de conexão ou estrutura SQL incompleta. Corrija a configuração indicada no hPanel e reinicie a aplicação. Os logs registram somente nomes de variáveis e códigos de erro, sem as senhas.

Se a importação SQL V2 ainda apresentar **1005 / errno 150**, clique em **Detalhes** no erro do phpMyAdmin e confira a tabela referenciada. Na aba SQL do banco, `SHOW CREATE TABLE contract_catalog;` mostra se a tabela existente tem o formato esperado. Não exclua tabelas com registros para tentar resolver a importação.

## Documentação e validação

- [LEIA_PRIMEIRO.txt](LEIA_PRIMEIRO.txt): instalação e manutenção completas.
- [VALIDACAO.txt](VALIDACAO.txt): verificações locais realizadas com Node.js 24 e MariaDB 10.11.
- [Guia oficial da Hostinger](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/).

Base: GWL NEXO 2.0, versão 80, de 30/09/2026. Este repositório contém o código preparado para implantação; a publicação na Hostinger depende da configuração do banco e da aplicação no hPanel.
