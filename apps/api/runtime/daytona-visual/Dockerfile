FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    MPLBACKEND=Agg

RUN pip install --no-cache-dir \
    matplotlib==3.10.1 \
    pydantic==2.11.7

CMD ["python3", "--version"]
