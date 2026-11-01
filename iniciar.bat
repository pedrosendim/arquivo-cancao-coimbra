@echo off
rem Abre o Arquivo da Cancao de Coimbra no browser (http://localhost:8765)
cd /d "%~dp0"
if not exist "arquivo\indice.sqlite" (
  echo Primeira utilizacao: a recolher os blogues e a criar o indice...
  python scripts\recolher_blogger.py
  python scripts\indexar.py
)
python scripts\construir.py --forcar
python scripts\servidor.py --abrir
pause
