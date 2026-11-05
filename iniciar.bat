@echo off
rem Abre o Arquivo da Cancao de Coimbra no browser (http://localhost:8765)
cd /d "%~dp0"
chcp 65001 >nul

rem 1. Trazer o que foi gravado ou aprovado no site online. So avanca se nao chocar com o que esta nesta copia;
rem    sem rede (ou sem git), o arquivo abre na mesma, com a copia deste computador.
echo A trazer as alteracoes feitas no site online...
git -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=15 pull --ff-only --quiet
if errorlevel 1 (
  echo.
  echo  AVISO: nao foi possivel trazer as alteracoes do site online
  echo  ^(sem rede, ou ha alteracoes nesta copia nos mesmos ficheiros^).
  echo  O arquivo abre na mesma, com a copia deste computador. Peca ao Claude para as juntar.
  echo.
)

if not exist "arquivo\indice.sqlite" (
  echo Primeira utilizacao: a recolher os blogues e a criar o indice...
  python scripts\recolher_blogger.py
  python scripts\indexar.py
)

rem 2. Construir o site. Com --forcar constroi mesmo que a validacao encontre erros, mas os erros ficam a vista.
python scripts\construir.py --forcar > "%TEMP%\arquivo-construir.txt" 2>&1
type "%TEMP%\arquivo-construir.txt"
findstr /b /c:"ERRO" "%TEMP%\arquivo-construir.txt" >nul
if not errorlevel 1 (
  echo.
  echo  AVISO: a validacao encontrou erros nos dados ^(as linhas ERRO acima^). O site abre na mesma, mas
  echo  enquanto houver erros nada se publica online. Peca ao Claude para os corrigir.
  echo.
)

python scripts\servidor.py --abrir
pause
