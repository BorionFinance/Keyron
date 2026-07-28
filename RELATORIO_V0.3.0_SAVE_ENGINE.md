# Relatório de implementação — Keyron v0.3.0 Save Engine

## Objetivo

Aproveitar a maturidade de salvamento do Borion sem copiar módulos financeiros, estados de perfil ou dados em texto puro para dentro do Keyron.

## O que foi reaproveitado conceitualmente do Borion

### 1. WAL antes da confirmação remota

O Borion protege a alteração local antes de esperar o Google Drive. O Keyron agora segue o mesmo princípio, com uma diferença obrigatória: o WAL contém apenas o bundle já cifrado com AES-GCM.

Fluxo:

```text
alteração na interface
→ snapshot em memória
→ criptografia AES-GCM
→ WAL cifrado no IndexedDB
→ current cifrado no IndexedDB
→ interface confirma salvamento local
→ sincronização do Drive em segundo plano
→ confirmação remota
→ limpeza segura do WAL
```

### 2. Fila durável e estado pendente

Cada bundle recebe:

- `revision`;
- `operationId`;
- `deviceId`;
- horário de salvamento local;
- motivo técnico da alteração.

Esses campos não contêm senhas. Eles permitem distinguir uma confirmação antiga de uma operação mais recente.

### 3. Consolidação de rajadas

Quando várias alterações acontecem enquanto uma cifragem já está em andamento, o Keyron mantém apenas o snapshot pendente mais recente. Isso reduz cifragens e gravações intermediárias sem perder o estado final.

### 4. Local-first real

A interface não depende do tempo da API do Google. Depois que o bundle cifrado foi confirmado no IndexedDB, o usuário pode continuar usando o aplicativo.

### 5. Retentativa progressiva

Quando a internet ou o Drive falham, o Keyron tenta novamente em intervalos crescentes, limitados a 60 segundos. O estado local continua protegido durante esse período.

### 6. Proteção ao sair

O aplicativo tenta concluir a fila local quando:

- a página fica oculta;
- o usuário bloqueia o cofre;
- a aba recebe `pagehide`;
- a conexão volta a ficar online.

### 7. Coordenação entre abas

Quando suportado, `navigator.locks` serializa a escrita remota. Um `BroadcastChannel` avisa que outra aba também está usando o Keyron.

### 8. Backups sem atrasar o current

A versão anterior verificava a pasta de backups antes de cada atualização do cofre. Agora:

1. `vault.keyron` é atualizado primeiro;
2. a versão remota anterior é usada para snapshot;
3. a criação e rotação do snapshot rodam em segundo plano;
4. a última verificação de snapshot fica em cache por até 12 horas.

## O que não foi copiado do Borion

- dados de perfis financeiros;
- mesclagem de receitas, despesas, contas e lançamentos;
- journal remoto específico do Borion;
- seletores de pasta e estrutura de conta do Borion;
- módulos que guardariam conteúdo sensível sem a criptografia própria do Keyron.

Copiar esses trechos literalmente aumentaria o tamanho, a superfície de ataque e o risco de regressão sem trazer benefício ao cofre.

## Resultado esperado

- resposta visual mais rápida;
- menor quantidade de uploads redundantes;
- proteção local mesmo quando o Drive demora;
- recuperação de alteração pendente após fechamento inesperado;
- menor risco de uma confirmação antiga apagar o marcador de uma operação nova;
- snapshots sem bloquear o salvamento principal.
