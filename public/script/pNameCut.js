product_count=document.getElementsByClassName("pName").length
console.log(document.getElementsByClassName("pName").length);

for (let i = 0; i < product_count; i++) {
    let a=document.getElementsByClassName("pName")[i].innerText;
    console.log(a.slice(0,18)+"...")
    document.getElementsByClassName("pName")[i].innerText=a.slice(0,18)+"..."
}