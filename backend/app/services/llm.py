"""Provider-neutral LLM interface.

Reads LLM_PROVIDER (openai | anthropic | google | none), LLM_MODEL, LLM_API_KEY from settings.
Returns None without error when no key is configured — the app still works, AI buttons disabled.
"""

from __future__ import annotations

from ..config import settings


class LLMError(Exception):
    """The provider was configured but the call failed (bad key, network, missing SDK...)."""


def llm_status() -> dict:
    return {
        "enabled": llm_enabled(),
        "provider": (settings.llm_provider or None) if llm_enabled() else None,
        "model": settings.llm_model if llm_enabled() else None,
    }


def llm_enabled() -> bool:
    """True if provider and api_key are set."""
    return bool(settings.llm_provider and settings.llm_api_key)


def call_llm(system: str, user: str) -> str | None:
    """Call the configured LLM provider.

    Returns None if no provider is configured; raises LLMError if the call fails.
    """
    if not llm_enabled():
        return None

    provider = (settings.llm_provider or "").lower().strip()
    model = settings.llm_model
    api_key = settings.llm_api_key

    try:
        if provider == "openai":
            import openai  # type: ignore[import-untyped]

            client = openai.OpenAI(api_key=api_key)
            effective_model = model or "gpt-4o-mini"
            response = client.chat.completions.create(
                model=effective_model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                max_tokens=4096,
            )
            return response.choices[0].message.content

        elif provider == "anthropic":
            import anthropic  # type: ignore[import-untyped]

            client = anthropic.Anthropic(api_key=api_key)
            effective_model = model or "claude-opus-5-5"
            message = client.messages.create(
                model=effective_model,
                max_tokens=16000,
                system=system,
                messages=[{"role": "user", "content": user}],
            )
            if message.stop_reason == "refusal":
                raise LLMError("The model declined this request.")
            # Newer models may return thinking blocks first; take only the text.
            return "".join(b.text for b in message.content if b.type == "text")

        elif provider == "google":
            import google.generativeai as genai  # type: ignore[import-untyped]

            genai.configure(api_key=api_key)
            effective_model = model or "gemini-pro"
            gen_model = genai.GenerativeModel(
                model_name=effective_model,
                system_instruction=system,
            )
            response = gen_model.generate_content(user)
            return response.text

        else:
            raise LLMError(f"Unknown LLM_PROVIDER '{provider}' (use openai, anthropic or google)")

    except LLMError:
        raise
    except ImportError as exc:
        raise LLMError(f"The SDK for '{provider}' is not installed: pip install {exc.name}") from exc
    except Exception as exc:  # network, auth, quota...
        raise LLMError(f"{type(exc).__name__}: {exc}") from exc
