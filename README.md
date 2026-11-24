# Mini Builders OKAMI

Simulador 3D interativo e contemplativo construído com Three.js r128, HTML5/Tailwind CSS e JavaScript clássico em namespace global (`window.MO`), projetado para abrir diretamente via `index.html` (`file://`), sem necessidade de build ou servidor HTTP.

## Como Executar

1. Abra o arquivo `index.html` diretamente em um navegador moderno (Chrome, Edge ou Firefox).
2. Na **Tela Inicial** sobre o vale 3D vivo:
   - Escolha **🌍 Nova Cidade**, defina o **Nome do Supervisor**, selecione **💼 Gestão Real** ou **🎨 Sandbox Livre** e, opcionalmente, ajuste `Seed` e bioma (**🌲 Floresta** é o *vertical slice* principal).
   - Ou clique em **🏡 Continuar Cidade** para retomar a cidade salva (`localStorage`), com estradas, estruturas, acampamento, equipe e construções restaurados.
3. Você inicia no zero com **1 Supervisor nomeado + 1 Operário** e a Caixa de Ferramentas em um terreno procedural infinito por chunks (`24 × 24 m`, janela `7 × 7`), com montanhas facetadas, rios sinuosos, lagos, bosques densos, flores, nuvens low-poly e minas naturais (`WASD`/Setas ou botão do meio movem a câmera).
4. **Controles principais da HUD minimalista:**
   - **Dock central (4 categorias):** **🛣️ Vias** (estrada de terra/rua pavimentada A→B), **🏗️ Apoio** (baia de descarga, masseira, bancada, depósito, lanchonete, barraca, refletor — tudo posicionado onde você escolher com prévia 3D Ghost), **🏠 Cidade** (`Casa Auto`, `Casa Tam.` por arraste `L×C`, `Prédio`, `Ponte`, `Torre` construídos automaticamente pelos trabalhadores) e **🌾 Economia** (`Fazenda`, `Serraria`, `Mercado`).
   - **👥 Social (canto inferior esquerdo):** lista todos os NPCs do mapa, suas profissões, atividade e necessidades (`⚡/💧/🍲`).
   - **📱 Celular do Gestor (canto inferior direito):** compre e chame o **🚚 Caminhão de Entregas** (que trafega pelas estradas/ruas conectadas até a Baia), exporte excedentes, contrate especialistas (**Construtor, Lenhador, Mineiro, Fazendeiro, Comerciante**) e acesse **⚙️ Opções**, velocidade (`1x/2x/4x`) e Modo Zen.
5. Os recursos naturais entram via extração real (árvores para madeira, minas/pedreiras naturais no terreno para pedra e ferro, fazendas para comida) ou por encomenda paga no caminhão pelo celular.

### Atalhos e Diagnóstico

- `H` (ou botão `📺` dentro do `📱 Celular`): alterna o **Modo Zen** (`Esc` sai do Modo Zen).
- `P` (ou `⚙️ Opções → 📊 FPS`): abre/fecha o **Painel de Diagnóstico** com FPS, *frame time* (`ms`), passos/s, `draw calls`, triângulos, geometrias/texturas em GPU (`renderer.info.memory`), `JS Heap` e recursos protegidos.
- **Tour Contemplativo (`🎥`) & Modo Relax (`🌙`)**: acessíveis pelo menu **⚙️ Opções** dentro do Celular.

## Arquitetura de Módulos

- `index.html`: tela inicial cinematográfica, HUD minimalista (recursos no topo esquerdo, Social e Celular nos cantos inferiores, dock de 4 categorias) e carregamento ordenado em `file://`.
- `src/core/`:
  - `state.js`: estado global da simulação e constantes compartilhadas.
  - `simClock.js`: relógio *fixed timestep* (`1/60`s) com acumulador e proteção anti-salto.
  - `materials.js`: texturas procedurais em canvas e materiais PBR compartilhados (`MO.mats`).
  - `resources.js`: descarte seguro (`clearGroup`, `removeAndDispose`, `protect`).
  - `diagnostics.js`: telemetria de FPS, GPU memory e `draw calls` (`MO.diagnostics`).
  - `scene.js`, `biomes.js`, `events.js`, `audio.js`: iluminação dia/entardecer/noite, horizonte celeste distante (Sol, Lua, estrelas, nuvens low-poly), biomas, eventos estruturais e áudio procedural.
- `src/world/`: `chunkManager.js` (relevo multi-camada determinístico, hidrografia, minas naturais, bosques e flora ecológica), `terrain.js`, `cityManager.js` (posicionamento livre, prévia 3D Ghost, estradas A→B em 3D e persistência completa *Continuar Cidade*), `mixer.js`, `workbench.js`, `regionManager.js`, `constructionManager.js` e `worldManager.js`.
- `src/entities/`:
  - `camp.js`, `siteLogistics.js` (roteamento BFS do caminhão pelas vias construídas + compras/exportação), `navigation.js` (A* local dinâmico e cache de obstáculos).
  - `workers/workerRegistry.js`, `workerNeeds.js`, `workerTasks.js`, `workerAgent.js` e `workers.js`: perfis configuráveis, profissões, necessidades e automação das obras na cidade.
- `src/modes/`: modos construtivos `house/`, `bridge/`, `building/` e `tower/`.
- `src/ui/`: `hud.js` e `input.js`.
- `src/main.js`: loop principal com *fixed timestep* e interpolação visual.

## Testes Automatizados

Os testes utilizam o runner nativo do Node.js (`node:test`) sem dependências externas:

```powershell
node --test --test-concurrency=2 tests/*.test.js
```
