#!/bin/bash
set -euo pipefail

usage() {
  echo "Usage: bash scripts/provision-swa.sh --name <swa-name> --resource-group <rg> --location <azure-region> [options]"
  echo ""
  echo "Required:"
  echo "  --name              Static Web App name"
  echo "  --resource-group    Resource group for the Static Web App"
  echo "  --location          Azure region, for example eastus2"
  echo ""
  echo "Optional:"
  echo "  --subscription      Azure subscription id or name"
  echo "  --sku               Free or Standard (default: Free)"
  echo "  --domain            Custom domain to bind, for example apps.azure.sabbour.me"
  echo "  --dns-zone-id       Full Azure DNS zone resource id"
  echo "  --dns-zone-rg       Resource group of the Azure DNS zone"
  echo "  --dns-zone-name     Azure DNS zone name, for example azure.sabbour.me"
  echo "  --help              Show this message"
  echo ""
  echo "Example:"
  cat <<'EOF'
  bash scripts/provision-swa.sh \
    --name adaptive-ui-apps \
    --resource-group rg-adaptive-ui \
    --location eastus2 \
    --domain apps.azure.sabbour.me \
    --dns-zone-id /subscriptions/<sub>/resourceGroups/azure.sabbour.me-rg/providers/Microsoft.Network/dnszones/azure.sabbour.me
EOF
}

parse_dns_zone_id() {
  local zone_id="$1"
  local rg
  local zone

  rg="$(echo "$zone_id" | sed -n 's#.*[Rr]esource[Gg]roups/\([^/]*\)/.*#\1#p')"
  zone="$(echo "$zone_id" | sed -n 's#.*[Dd][Nn][Ss][Zz]ones/\([^/]*\)$#\1#p')"

  if [[ -z "$rg" || -z "$zone" ]]; then
    echo "ERROR: could not parse --dns-zone-id."
    echo "Expected format: /subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.Network/dnszones/<zone>"
    exit 1
  fi

  DNS_ZONE_RG="$rg"
  DNS_ZONE_NAME="$zone"
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: required command not found: $cmd"
    exit 1
  fi
}

NAME=""
RESOURCE_GROUP=""
LOCATION=""
SUBSCRIPTION=""
SKU="Free"
DOMAIN=""
DNS_ZONE_RG=""
DNS_ZONE_NAME=""
DNS_ZONE_ID=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name)
      NAME="$2"
      shift 2
      ;;
    --resource-group)
      RESOURCE_GROUP="$2"
      shift 2
      ;;
    --location)
      LOCATION="$2"
      shift 2
      ;;
    --subscription)
      SUBSCRIPTION="$2"
      shift 2
      ;;
    --sku)
      SKU="$2"
      shift 2
      ;;
    --domain)
      DOMAIN="$2"
      shift 2
      ;;
    --dns-zone-id)
      DNS_ZONE_ID="$2"
      shift 2
      ;;
    --dns-zone-rg)
      DNS_ZONE_RG="$2"
      shift 2
      ;;
    --dns-zone-name)
      DNS_ZONE_NAME="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: unknown argument: $1"
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$NAME" || -z "$RESOURCE_GROUP" || -z "$LOCATION" ]]; then
  echo "ERROR: --name, --resource-group, and --location are required."
  usage
  exit 1
fi

if [[ "$SKU" != "Free" && "$SKU" != "Standard" ]]; then
  echo "ERROR: --sku must be Free or Standard"
  exit 1
fi

if [[ -n "$DNS_ZONE_ID" ]]; then
  parse_dns_zone_id "$DNS_ZONE_ID"
fi

if [[ -n "$DOMAIN" ]]; then
  if [[ -z "$DNS_ZONE_RG" || -z "$DNS_ZONE_NAME" ]]; then
    echo "ERROR: --domain requires either --dns-zone-id or both --dns-zone-rg and --dns-zone-name"
    exit 1
  fi
fi

require_cmd az

if ! az account show >/dev/null 2>&1; then
  echo "No Azure login found. Opening browser login..."
  az login >/dev/null
fi

if [[ -n "$SUBSCRIPTION" ]]; then
  echo "Setting Azure subscription: $SUBSCRIPTION"
  az account set --subscription "$SUBSCRIPTION"
fi

SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
echo "Using subscription: $SUBSCRIPTION_ID"

if ! az group show --name "$RESOURCE_GROUP" >/dev/null 2>&1; then
  echo "Creating resource group: $RESOURCE_GROUP"
  az group create --name "$RESOURCE_GROUP" --location "$LOCATION" >/dev/null
else
  echo "Resource group already exists: $RESOURCE_GROUP"
fi

if az staticwebapp show --name "$NAME" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
  echo "Static Web App already exists: $NAME"
else
  echo "Creating Static Web App: $NAME"
  az staticwebapp create \
    --name "$NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --sku "$SKU" \
    >/dev/null
fi

DEFAULT_HOSTNAME="$(az staticwebapp show --name "$NAME" --resource-group "$RESOURCE_GROUP" --query defaultHostname -o tsv)"
if [[ -z "$DEFAULT_HOSTNAME" ]]; then
  echo "ERROR: could not resolve default hostname for Static Web App."
  exit 1
fi

echo "Default hostname: $DEFAULT_HOSTNAME"

DEPLOY_TOKEN="$(az staticwebapp secrets list --name "$NAME" --resource-group "$RESOURCE_GROUP" --query properties.apiKey -o tsv)"
if [[ -z "$DEPLOY_TOKEN" ]]; then
  DEPLOY_TOKEN="$(az staticwebapp secrets list --name "$NAME" --resource-group "$RESOURCE_GROUP" --query apiKey -o tsv)"
fi

if [[ -z "$DEPLOY_TOKEN" ]]; then
  echo "ERROR: failed to retrieve deployment token."
  exit 1
fi

if [[ -n "$DOMAIN" ]]; then
  echo "Configuring Azure DNS CNAME for: $DOMAIN"

  RECORD_NAME=""
  if [[ "$DOMAIN" == "$DNS_ZONE_NAME" ]]; then
    RECORD_NAME="@"
  elif [[ "$DOMAIN" == *".$DNS_ZONE_NAME" ]]; then
    RECORD_NAME="${DOMAIN%.$DNS_ZONE_NAME}"
  else
    echo "ERROR: domain $DOMAIN is not inside DNS zone $DNS_ZONE_NAME"
    exit 1
  fi

  az network dns record-set cname create \
    --resource-group "$DNS_ZONE_RG" \
    --zone-name "$DNS_ZONE_NAME" \
    --name "$RECORD_NAME" \
    --ttl 300 \
    >/dev/null

  az network dns record-set cname set-record \
    --resource-group "$DNS_ZONE_RG" \
    --zone-name "$DNS_ZONE_NAME" \
    --record-set-name "$RECORD_NAME" \
    --cname "$DEFAULT_HOSTNAME" \
    >/dev/null

  echo "CNAME configured: $DOMAIN -> $DEFAULT_HOSTNAME"
  echo "Attempting to bind custom domain to Static Web App..."

  if az staticwebapp hostname set \
    --name "$NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --hostname "$DOMAIN" \
    >/dev/null 2>&1; then
    echo "Custom domain bound successfully: $DOMAIN"
  else
    echo "Custom domain bind is not ready yet. DNS may still be propagating."
    echo "Retry this command after propagation:"
    echo "az staticwebapp hostname set --name $NAME --resource-group $RESOURCE_GROUP --hostname $DOMAIN"
  fi
fi

echo ""
echo "========================================="
echo "Static Web App is provisioned"
echo "========================================="
echo "Name:                $NAME"
echo "Resource group:      $RESOURCE_GROUP"
echo "Region:              $LOCATION"
echo "SKU:                 $SKU"
echo "Default hostname:    https://$DEFAULT_HOSTNAME"
if [[ -n "$DOMAIN" ]]; then
  echo "Custom domain:       https://$DOMAIN"
fi
echo ""
echo "GitHub secret to add in repo sabbour/adaptive-ui:"
echo "  Name:  AZURE_STATIC_WEB_APPS_API_TOKEN"
echo "  Value: $DEPLOY_TOKEN"
echo ""
echo "After adding the secret, run workflow: .github/workflows/deploy-swa.yml"
