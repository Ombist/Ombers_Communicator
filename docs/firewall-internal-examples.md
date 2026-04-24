# 僅內網放行 Ombers 埠：範例片段

**警告**：以下為示意，**不應直接複製到生產**。請替換：

- `TAILNET_CIDR`：例如 `100.64.0.0/10`（以你的 VPN 文件為準）
- `PHONE`、`MACHINE`：與團隊通訊設定一致（`MACHINE = PHONE + 1`）
- 介面名稱（`eth0`、`ens3`）依實機調整

執行前請確認不會鎖死 SSH（保留 `22` 規則或 console 存取）。

---

## nftables（範例）

下列為 **flush 後獨立 table** 的示意；實務上請併入既有 `inet filter`／`hook input`，避免與 SSH、loopback 規則衝突。變數語法依 `nft` 版本可能略有差異，請以 `nft -c -f file.nft` 先做語法檢查。

```nft
# 請先替換常數，並確認不會鎖死 SSH
flush ruleset

define TAILNET_CIDR = 100.64.0.0/10
define PHONE_PORT = 8080
define MACHINE_PORT = 8081

table inet ombers_filter {
  chain input {
    type filter hook input priority filter; policy drop;
    iif lo accept
    # 管理 SSH：請改為你的跳板 CIDR，勿留任意來源
    # ip saddr YOUR_ADMIN_CIDR tcp dport 22 accept
    ip saddr $TAILNET_CIDR tcp dport $PHONE_PORT accept
    ip saddr $TAILNET_CIDR tcp dport $MACHINE_PORT accept
  }
}
```

載入：`nft -f ./ombers-internal.nft`（路徑自訂）。重開機持久化請用發行版建議（`nftables` systemd 單元或發行版套件）。

---

## ufw（範例）

```bash
# 預設拒絕入站（若尚未）
sudo ufw default deny incoming
sudo ufw default allow outgoing

# SSH（請限制來源，勿對 0.0.0.0/0 全開）
sudo ufw allow from YOUR_ADMIN_CIDR to any port 22 proto tcp

# Ombers：僅 tailnet
sudo ufw allow from TAILNET_CIDR to any port PHONE_PORT proto tcp
sudo ufw allow from TAILNET_CIDR to any port MACHINE_PORT proto tcp

sudo ufw enable
sudo ufw status verbose
```

將 `TAILNET_CIDR`、`PHONE_PORT`、`MACHINE_PORT`、`YOUR_ADMIN_CIDR` 換成實際值。

---

## 驗證

自 tailnet 內節點：

```bash
curl -sS "http://RELAY_IP:PHONE/health"
curl -sS "http://RELAY_IP:MACHINE/health"
```

完整說明見上層：[docs/relay-internal-firewall.md](../../docs/relay-internal-firewall.md)。
