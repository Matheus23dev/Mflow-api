# MFlow API

API NestJS com autenticação JWT, Prisma e MySQL para a operação financeira do MFlow.

## Configuração

O arquivo `.env` contém as variáveis principais da aplicação:

```dotenv
DATABASE_URL="mysql://USER:PASSWORD@HOST:3306/mflow"
JWT_SECRET="substitua-por-um-segredo-forte"
```

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

Em uma instalação existente, aplique a nova tabela antes de publicar a versão:

```bash
npm run db:deploy
```

Depois de informar a URL real, crie o banco, aplique as migrações e configure o acesso inicial:

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
