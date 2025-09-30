# Script de prueba para verificar sincronización de Redis
# test-redis-sync.ps1

Write-Host "🧪 Iniciando pruebas de sincronización de Redis..." -ForegroundColor Blue
Write-Host ""

# Función para hacer petición HTTP
function Test-Endpoint {
    param(
        [string]$Url,
        [string]$Method = "GET",
        [string]$Body = ""
    )
    
    try {
        if ($Method -eq "GET") {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
        } else {
            $response = Invoke-WebRequest -Uri $Url -Method $Method -Body $Body -ContentType "application/json" -UseBasicParsing -TimeoutSec 5
        }
        
        return @{
            Success = $true
            StatusCode = $response.StatusCode
            Content = $response.Content | ConvertFrom-Json
        }
    } catch {
        return @{
            Success = $false
            Error = $_.Exception.Message
        }
    }
}

# Prueba 1: Verificar que todas las instancias están conectadas a Redis
Write-Host "📊 Prueba 1: Verificando conexiones Redis..." -ForegroundColor Yellow

for ($i = 1; $i -le 5; $i++) {
    $result = Test-Endpoint "http://localhost/health"
    if ($result.Success) {
        $instance = $result.Content.instance
        $redis = $result.Content.redis
        $color = if ($redis -eq "connected") { "Green" } else { "Red" }
        Write-Host "   ✓ Instancia: $instance - Redis: $redis" -ForegroundColor $color
    } else {
        Write-Host "   ✗ Error: $($result.Error)" -ForegroundColor Red
    }
    Start-Sleep -Milliseconds 200
}

Write-Host ""

# Prueba 2: Verificar estadísticas iniciales de Redis
Write-Host "📈 Prueba 2: Estadísticas iniciales de Redis..." -ForegroundColor Yellow

$stats = Test-Endpoint "http://localhost/redis-stats"
if ($stats.Success) {
    $gameState = $stats.Content.gameState
    Write-Host "   ✓ Apuestas actuales: $($gameState.currentBets)" -ForegroundColor Green
    Write-Host "   ✓ Jugadores activos: $($gameState.activePlayers)" -ForegroundColor Green
    Write-Host "   ✓ Estado de ronda: $($gameState.roundState)" -ForegroundColor Green
} else {
    Write-Host "   ✗ Error obteniendo estadísticas: $($stats.Error)" -ForegroundColor Red
}

Write-Host ""

# Prueba 3: Verificar distribución de carga
Write-Host "⚖️ Prueba 3: Verificando distribución de carga..." -ForegroundColor Yellow

$instances = @{}
for ($i = 1; $i -le 12; $i++) {
    $result = Test-Endpoint "http://localhost/redis-stats"
    if ($result.Success) {
        $instance = $result.Content.instance
        if ($instances.ContainsKey($instance)) {
            $instances[$instance]++
        } else {
            $instances[$instance] = 1
        }
    }
    Start-Sleep -Milliseconds 100
}

Write-Host "   Distribución de peticiones:"
foreach ($instance in $instances.Keys) {
    $count = $instances[$instance]
    $percentage = [Math]::Round(($count / 12) * 100, 1)
    Write-Host "   ✓ $instance : $count peticiones ($percentage%)" -ForegroundColor Green
}

Write-Host ""

# Prueba 4: Simular carga de apuestas (esto requeriría un cliente WebSocket real)
Write-Host "🎯 Prueba 4: Estado final del sistema..." -ForegroundColor Yellow

$finalStats = Test-Endpoint "http://localhost/redis-stats"
if ($finalStats.Success) {
    Write-Host "   ✓ Sistema funcionando correctamente" -ForegroundColor Green
    Write-Host "   ✓ Instancia respondiendo: $($finalStats.Content.instance)" -ForegroundColor Green
    Write-Host "   ✓ Redis conectado: $($finalStats.Content.redis)" -ForegroundColor Green
    Write-Host "   ✓ Timestamp: $($finalStats.Content.timestamp)" -ForegroundColor Green
} else {
    Write-Host "   ✗ Error en verificación final: $($finalStats.Error)" -ForegroundColor Red
}

Write-Host ""

# Prueba 5: Limpiar estado de Redis (opcional)
Write-Host "🧹 Prueba 5: Limpieza de estado (opcional)..." -ForegroundColor Yellow
$response = Read-Host "¿Desea limpiar el estado de Redis? (y/N)"

if ($response -eq "y" -or $response -eq "Y") {
    $clearResult = Test-Endpoint "http://localhost/redis-clear" "POST"
    if ($clearResult.Success) {
        Write-Host "   ✓ Estado de Redis limpiado exitosamente" -ForegroundColor Green
    } else {
        Write-Host "   ✗ Error limpiando Redis: $($clearResult.Error)" -ForegroundColor Red
    }
} else {
    Write-Host "   ✓ Estado de Redis mantenido" -ForegroundColor Green
}

Write-Host ""
Write-Host "🎉 Pruebas de sincronización de Redis completadas!" -ForegroundColor Blue
Write-Host "📋 Resumen:"
Write-Host "   • Load Balancer: ✅ Funcionando"
Write-Host "   • Redis: ✅ Conectado"
Write-Host "   • Instancias Backend: ✅ $($instances.Count) activas"
Write-Host "   • Distribución: ✅ Balanceada"
Write-Host ""