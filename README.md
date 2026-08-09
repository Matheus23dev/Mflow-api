# MFlow API

API NestJS com autenticação JWT, Prisma e MySQL para a operação financeira do MFlow.

## Configuração

O arquivo `.env` contém somente as duas variáveis necessárias:

```dotenv
DATABASE_URL="mysql://USER:PASSWORD@HOST:3306/mflow"
JWT_SECRET="substitua-por-um-segredo-forte"
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
