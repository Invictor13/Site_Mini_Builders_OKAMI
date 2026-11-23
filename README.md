# Mini Builders OKAMI

Simulador 3D interativo e contemplativo construído com Three.js r128, HTML5/Tailwind CSS e JavaScript clássico em namespace global (`window.MO`), projetado para abrir diretamente via `index.html` (`file://`), sem necessidade de build ou servidor HTTP.

## Como Executar

1. Abra o arquivo `index.html` diretamente em um navegador moderno (Chrome, Edge ou Firefox).
2. A vila inicia no **Início Zero**: apenas a **Caixa de Ferramentas** no cenário. Use o menu **👷 NPCs** (`1 Supervisor` + até `10 Ajudantes`) ou ative o **🌙 Modo Relax** para o Supervisor demarcar estradas e estações enquanto os ajudantes abrem a estrada de terra, montam a baia de descarga, masseira, **Bancada de Madeira** (`workbench.js`) e pátios de estoque antes de iniciar as obras.
3. Todas as construções geradas pela semente (`seed`) coexistem na mesma vila (`🗺️ Vila`, `🏠 Casas`, `🌉 Ponte`, `🏢 Prédio`, `🗼 Torre`), onde a conclusão da ponte desbloqueia o Banco Leste e o controle `⚡ 1x/2x/4x` acelera a contemplação.

### Atalhos e Diagnóstico

- `H` (ou botão `📺`): alterna o **Modo Zen** (oculta a interface para contemplação; `Esc` sai do Modo Zen).
- `P` (ou botão `📊`): abre/fecha o **Painel de Diagnóstico** com FPS, frame time (`ms`), passos da simulação por segundo, `draw calls`, triângulos, contagem de geometrias/texturas em GPU (`renderer.info.memory`), `JS Heap` (quando exposto pelo navegador) e recursos protegidos.

## Arquitetura de Módulos

- `index.html`: estrutura da HUD, docks contextuais por modo/fase e carregamento ordenado dos scripts em `file://`.
- `src/core/`:
  - `state.js`: estado global da simulação e constantes do diorama (`DIORAMA_R`, `GRID_SIZE`).
  - `simClock.js`: relógio de simulação com *fixed timestep* (`1/60`s), acumulador e proteção anti-salto após pausas em segundo plano.
  - `materials.js`: texturas procedurais em canvas e materiais PBR compartilhados (`MO.mats`).
  - `resources.js`: ciclo de vida e descarte seguro (`MO.resources.clearGroup`, `removeAndDispose`, `protect`), preservando materiais/texturas compartilhados e geometrias internas de `THREE.Sprite`.
  - `diagnostics.js`: telemetria leve de FPS, simulação, memória e `draw calls` (`MO.diagnostics`).
  - `scene.js`, `biomes.js`, `events.js`, `audio.js`: cena WebGL, iluminação, biomas/clima, eventos estruturais e áudio procedural.
- `src/world/`: `terrain.js` (terreno unificado de vila por seed, mapa de estradas, rio e vegetação), `mixer.js` (masseira sob demanda), `workbench.js` (caixa de ferramentas e bancada de serra de madeira), `regionManager.js`, `constructionManager.js` e `worldManager.js`.
- `src/entities/`:
  - `camp.js`, `siteLogistics.js`, `navigation.js`: acampamento, caminhão/logística de materiais e navegação A* com desvio de colisões.
  - `workers/workerRegistry.js`: perfis configuráveis (`MO.WORKER_PROFILES`), criação de rig 3D e contratação extensível (`MO.workerFactory`).
  - `workers/workerNeeds.js`: necessidades (energia, fome, hidratação) e rotinas de acampamento (`MO.workerNeeds`).
  - `workers/workerTasks.js`: seleção/reserva de tarefas e cadeia logística (`MO.workerTasks`).
  - `workers/workerAgent.js`: locomoção, coleta, animações e conclusão de tarefas (`MO.workerAgent`).
  - `workers.js`: orquestrador de trabalhadores, regeneração de cenário e autopilot do Modo Relax.
- `src/modes/`: implementações isoladas dos modos `house/`, `bridge/`, `building/` e `tower/`.
- `src/ui/`: `hud.js` e `input.js` (controle orbital, raycasting, arraste e atalhos).
- `src/main.js`: loop principal com passo fixo para simulação e interpolação visual na renderização.

## Testes Automatizados

Os testes utilizam o runner nativo do Node.js (`node:test`, testado com Node v24) sem dependências externas:

```powershell
node --test --test-concurrency=2 tests/resources.test.js tests/lifecycle-integration.test.js tests/simClock.test.js tests/workers.test.js tests/diagnostics.test.js tests/worldManagers.test.js
```
