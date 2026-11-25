{
  const button = document.getElementById("rss-copy")
  const address = document.getElementById("rss-address")
  const status = document.getElementById("rss-copy-status")

  button.addEventListener("click", async () => {
    status.textContent = ""
    try {
      await navigator.clipboard.writeText(address.value)
    } catch {
      address.focus()
      address.select()
      status.textContent = "未能自动复制。地址已选中，请手动复制。"
      return
    }
    status.textContent = "RSS 地址已复制，可以粘贴到阅读器中。"
  })
  button.hidden = false
}
