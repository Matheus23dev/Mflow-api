# MFlow API

API NestJS com autenticação JWT, Prisma e PostgreSQL/Supabase para a operação financeira do MFlow.

## Configuração

O arquivo `.env` contém as variáveis principais da aplicação:

```dotenv
DATABASE_URL="postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require"
JWT_SECRET="substitua-por-um-segredo-forte"
```

No Render, use a URL **Session pooler** do Supabase, na porta `5432`. A senha precisa estar codificada para URL se tiver caracteres especiais. `DIRECT_URL` é opcional e pode receber a conexão direta para executar comandos Prisma em uma máquina com suporte a IPv6.

Baixe o certificado em **Database → Settings → SSL Configuration** no Supabase e salve como `prisma/supabase-ca.crt`. A API usa esse certificado para validar a identidade do servidor PostgreSQL. Como alternativa no Render, configure o conteúdo completo em `SUPABASE_DATABASE_CA`.

## Migrar do Aiven para o Supabase

1. Crie o projeto no Supabase e copie a URL **Session pooler** exibida em **Connect**.
2. Escolha um horário sem novos lançamentos e pause temporariamente a API no Render.
3. No Git Bash, dentro da API, configure as conexões somente para a sessão atual:

```bash
export MYSQL_SOURCE_URL='mysql://USUARIO:SENHA@HOST_AIVEN:PORTA/defaultdb'
export MYSQL_SOURCE_CA='-----BEGIN CERTIFICATE-----\nCERTIFICADO_CA_DO_AIVEN\n-----END CERTIFICATE-----'
export POSTGRES_TARGET_URL='postgresql://postgres.PROJECT_REF:SENHA@HOST_POOLER:5432/postgres?sslmode=require'
```

4. Crie as tabelas no Supabase e copie os dados:

```bash
npm run db:deploy
npm run db:migrate:from-mysql
```

O copiador exige que as tabelas do MFlow no Supabase estejam vazias, preserva os IDs e relacionamentos e confere a quantidade de registros de todas as tabelas. Usuários, clientes, empréstimos, parcelas, cobranças, pagamentos, caixa e referências dos comprovantes são transferidos. Os arquivos dos comprovantes continuam no Cloudflare R2 e não precisam ser enviados novamente.

5. No Render, troque apenas `DATABASE_URL` pela URL **Session pooler** do Supabase, remova a antiga `DATABASE_CA` e faça um novo deploy. Só encerre o Aiven depois de entrar no sistema e conferir clientes, empréstimos, relatórios e comprovantes.

Não execute `db:setup` antes da cópia, pois ele cria o usuário inicial e o destino deixará de estar vazio.

## Comprovantes privados

Crie um bucket **Standard**, privado e exclusivo para o MFlow no Cloudflare R2. Gere uma credencial limitada a leitura e gravação nesse bucket e acrescente ao `.env`:

```dotenv
R2_ACCOUNT_ID="seu-account-id"
R2_ACCESS_KEY_ID="sua-access-key"
R2_SECRET_ACCESS_KEY="sua-secret-key"
R2_BUCKET_NAME="mflow-comprovantes"
DISCORD_RECEIPTS_WEBHOOK_URL=""
```

O webhook do Discord é opcional e recebe somente alertas de espaço, nunca comprovantes ou dados do cliente. O sistema alerta em 8 GB, entra em nível crítico em 8,5 GB e bloqueia novos arquivos em 9 GB. Esse teto não pode ser configurado acima de 9 GB, preservando margem antes da franquia de 10 GB. Use um bucket dedicado e não envie arquivos manualmente para que o controle permaneça completo.

Imagens são convertidas para WebP sem metadados e limitadas a 1,5 MB após a compactação. PDFs são aceitos até 3 MB. Os comprovantes são privados. Quando um contrato é encerrado, cancelado ou renovado, os comprovantes dos pagamentos são apagados e permanece somente o comprovante do valor entregue ao cliente (liberação original ou dinheiro novo da renovação). A exclusão definitiva do empréstimo apaga todos os arquivos dele.

Novos arquivos são organizados no bucket por usuário, nome do cliente e contrato. Comprovantes de pagamento recebem nomes como `parcela-03--pix--2026-08-11--<id>.pdf`, facilitando a busca manual no painel do R2. Objetos antigos permanecem no caminho original e continuam acessíveis pelo sistema.

Em uma instalação PostgreSQL existente, aplique novas migrations antes de publicar a versão:

```bash
npm run db:deploy
```

Em uma instalação nova e vazia, aplique as migrations e configure o acesso inicial:

```bash
npm run db:setup
```

O seed pode ser executado mais de uma vez e configura `admin@gmail.com` com a senha inicial `123456`. Troque essa senha depois do primeiro acesso.

Para zerar clientes, contratos, pagamentos e caixa, mantendo somente esse administrador, existe o comando destrutivo e explícito:

```bash
npm run db:reset-admin
```

## Executar

```bash
npm install
npm run start:dev
```

A API inicia em `http://localhost:3000/api` e a documentação Swagger fica em `http://localhost:3000/api/docs`.

## Verificações

```bash
npm run build
npm test -- --runInBand
```
