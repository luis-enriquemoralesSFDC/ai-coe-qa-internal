from __future__ import annotations
"""
Tabla de precios de OpenAI por modelo (USD por 1M tokens).

Fuente: https://openai.com/api/pricing/ — actualizar manualmente si OpenAI ajusta tarifas.
Última revisión: 2026-04.

Uso:
    cost = estimate_cost("gpt-4o-2024-08-06", input_tokens=1500, output_tokens=800)
"""

# Precio en USD por 1 millón de tokens
# Estructura: {model_name: (input_price_per_mtok, output_price_per_mtok)}
_PRICING_USD_PER_MTOK: dict[str, tuple[float, float]] = {
    "gpt-4o-2024-08-06": (2.50, 10.00),
    "gpt-4o": (2.50, 10.00),
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4.1": (2.00, 8.00),
    "gpt-4.1-mini": (0.40, 1.60),
    "gpt-4.1-nano": (0.10, 0.40),
    "o1": (15.00, 60.00),
    "o1-mini": (1.10, 4.40),
    "o3-mini": (1.10, 4.40),
}

_UNKNOWN_MODEL_PRICE = (2.50, 10.00)


def estimate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    """
    Calcula el costo en USD de una llamada dada.
    Si el modelo no está en la tabla, asume tarifa de gpt-4o (conservador) y registra el caso al loguear.
    """
    in_price, out_price = _PRICING_USD_PER_MTOK.get(model, _UNKNOWN_MODEL_PRICE)
    return (input_tokens * in_price + output_tokens * out_price) / 1_000_000


def is_known_model(model: str) -> bool:
    return model in _PRICING_USD_PER_MTOK


def supported_models() -> list[str]:
    return sorted(_PRICING_USD_PER_MTOK.keys())
