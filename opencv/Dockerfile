FROM python:3.12-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3-dev \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

# ✅ Upgrade pip/setuptools/wheel first
RUN pip install --upgrade pip setuptools wheel

# Then install your requirements
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
CMD ["python", "app.py"]
