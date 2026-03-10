const container = document.querySelector(".container");
container.addEventListener("animationend", () => {
  container.classList.remove("active");
});
function playMusic() {
    var music = document.getElementById("music");
    music.play();
}
